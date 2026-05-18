"""OpenFGA Integ Visualizer -- Flask backend.

Serves the visualizer frontend and provides /api/config with model + tuples
enriched with live user data from Keycloak, LDAP, or static config.
"""

import json
import os
import logging
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

import yaml
from flask import Flask, jsonify, render_template, request, send_from_directory

from fga_parser import parse_fga_files

app = Flask(__name__)
log = logging.getLogger(__name__)

BASE_DIR = Path(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = BASE_DIR / "config"

USER_SOURCE = os.environ.get("USER_SOURCE", "static").lower()
OPENFGA_MODEL_FILE = os.environ.get("OPENFGA_MODEL_FILE", str(CONFIG_DIR / "default.json"))
PROJECT_DATA_FILE = os.environ.get("PROJECT_DATA_FILE", str(CONFIG_DIR / "project-data.json"))

# Keycloak settings
KEYCLOAK_BASE_URL = os.environ.get("KEYCLOAK_BASE_URL", "http://keycloak:8080")
KEYCLOAK_REALM = os.environ.get("KEYCLOAK_REALM", "master")
KEYCLOAK_ADMIN_USER = os.environ.get("KEYCLOAK_ADMIN_USER", "admin")
KEYCLOAK_ADMIN_PASSWORD = os.environ.get("KEYCLOAK_ADMIN_PASSWORD", "")

# LDAP settings
LDAP_URL = os.environ.get("LDAP_URL", "ldaps://localhost:636")
LDAP_BASE_DN = os.environ.get("LDAP_BASE_DN", "dc=example,dc=com")
LDAP_BIND_DN = os.environ.get("LDAP_BIND_DN", "cn=admin,dc=example,dc=com")
LDAP_BIND_PASSWORD = os.environ.get("LDAP_BIND_PASSWORD", "")
LDAP_USER_FILTER = os.environ.get("LDAP_USER_FILTER", "(objectClass=inetOrgPerson)")
LDAP_USER_ATTR = os.environ.get("LDAP_USER_ATTR", "uid")
LDAP_TLS_VERIFY = os.environ.get("LDAP_TLS_VERIFY", "true").lower() == "true"

# Check for fga CLI availability at startup
FGA_AVAILABLE = shutil.which("fga") is not None


def load_json_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_static_users():
    """Load users from project-data.json."""
    try:
        data = load_json_file(PROJECT_DATA_FILE)
        return [u["id"] for u in data.get("users", [])]
    except Exception as e:
        log.warning("[STATIC] Failed to load project data: %s", e)
        return []


def get_keycloak_users():
    """Fetch users from Keycloak Admin REST API."""
    import requests

    try:
        # Get admin token via resource owner password grant
        token_url = f"{KEYCLOAK_BASE_URL}/realms/master/protocol/openid-connect/token"
        token_resp = requests.post(
            token_url,
            data={
                "grant_type": "password",
                "client_id": "admin-cli",
                "username": KEYCLOAK_ADMIN_USER,
                "password": KEYCLOAK_ADMIN_PASSWORD,
            },
            timeout=10,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        # List users in the realm
        users_url = f"{KEYCLOAK_BASE_URL}/admin/realms/{KEYCLOAK_REALM}/users"
        users_resp = requests.get(
            users_url,
            headers={"Authorization": f"Bearer {access_token}"},
            params={"max": 200},
            timeout=10,
        )
        users_resp.raise_for_status()

        users = []
        for u in users_resp.json():
            username = u.get("username", "")
            if username and username != "admin":
                users.append(username)
        return users

    except Exception as e:
        log.error("[KEYCLOAK] Failed to fetch users: %s", e)
        return []


def get_ldap_users():
    """Fetch users from OpenLDAP via ldap3."""
    try:
        import ldap3
        from ldap3 import Server, Connection, SUBTREE, Tls
        import ssl

        tls = None
        if LDAP_URL.startswith("ldaps://"):
            tls_config = Tls(
                validate=ssl.CERT_REQUIRED if LDAP_TLS_VERIFY else ssl.CERT_NONE
            )
            tls = tls_config

        server = Server(LDAP_URL, use_ssl=LDAP_URL.startswith("ldaps://"), tls=tls)
        conn = Connection(server, user=LDAP_BIND_DN, password=LDAP_BIND_PASSWORD, auto_bind=True)

        conn.search(
            search_base=LDAP_BASE_DN,
            search_filter=LDAP_USER_FILTER,
            search_scope=SUBTREE,
            attributes=[LDAP_USER_ATTR],
        )

        users = []
        for entry in conn.entries:
            uid_val = getattr(entry, LDAP_USER_ATTR, None)
            if uid_val:
                users.append(str(uid_val))

        conn.unbind()
        return users

    except ImportError:
        log.error("[LDAP] ldap3 library not installed")
        return []
    except Exception as e:
        log.error("[LDAP] Failed to fetch users: %s", e)
        return []


def get_users():
    """Fetch users from the configured source."""
    if USER_SOURCE == "keycloak":
        users = get_keycloak_users()
        if users:
            return users
        log.warning("[KEYCLOAK] Falling back to static users")
    elif USER_SOURCE == "ldap":
        users = get_ldap_users()
        if users:
            return users
        log.warning("[LDAP] Falling back to static users")

    return get_static_users()


def load_project_data():
    """Load the team/project structure from project-data.json."""
    try:
        return load_json_file(PROJECT_DATA_FILE)
    except Exception as e:
        log.warning("[DATA] Failed to load project data: %s", e)
        return {"users": [], "teams": [], "projects": []}


def build_tuples(project_data, users):
    """Generate OpenFGA tuples from project-data teams/RBAC and user list.

    Uses the team membership and RBAC definitions from project-data.json
    to generate relationship tuples. Users are matched against team members.
    """
    tuples = []
    user_set = set(users)

    for team in project_data.get("teams", []):
        team_id = team["id"]
        # Team membership tuples
        for member in team.get("members", []):
            if member in user_set:
                tuples.append({
                    "user": f"user:{member}",
                    "relation": "member",
                    "object": f"team:{team_id}",
                })

        # Team RBAC tuples
        for rbac in team.get("rbac", []):
            scope = rbac["scope"]
            role = rbac["role"]

            if scope.endswith(":*"):
                # Wildcard: apply to all objects of that type
                obj_type = scope.split(":")[0]
                if obj_type == "project":
                    for proj in project_data.get("projects", []):
                        tuples.append({
                            "user": f"team:{team_id}#member",
                            "relation": role,
                            "object": f"project:{proj['id']}",
                        })
                else:
                    # system:* or other
                    tuples.append({
                        "user": f"team:{team_id}#member",
                        "relation": role,
                        "object": scope.replace(":*", ":demo"),
                    })
            else:
                tuples.append({
                    "user": f"team:{team_id}#member",
                    "relation": role,
                    "object": scope,
                })

    return tuples


def build_config():
    """Build the full visualizer config with model, tuples, and user source."""
    # Load the OpenFGA model
    try:
        default_config = load_json_file(OPENFGA_MODEL_FILE)
        model = default_config.get("model", default_config)
    except Exception as e:
        log.error("[CONFIG] Failed to load model: %s", e)
        model = {"schema_version": "1.1", "type_definitions": [{"type": "user"}]}

    # Get users from configured source
    users = get_users()

    # Load project data for team/RBAC structure
    project_data = load_project_data()

    # Generate tuples from project data + users
    tuples = build_tuples(project_data, users)

    return {
        "model": model,
        "tuples": tuples,
        "user_source": USER_SOURCE,
        "users": users,
        "fga_available": FGA_AVAILABLE,
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/config")
def api_config():
    config = build_config()
    return jsonify(config)


@app.route("/api/users")
def api_users():
    users = get_users()
    return jsonify({"source": USER_SOURCE, "users": users})


@app.route("/api/validate", methods=["POST"])
def api_validate():
    if not FGA_AVAILABLE:
        return jsonify({"valid": False, "error": "fga CLI not found on the server"}), 501

    data = request.get_json(silent=True)
    if not data or "model" not in data:
        return jsonify({"valid": False, "error": "Request must contain a model key"}), 400

    model = data["model"]
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False
        ) as tmp:
            json.dump({"schema_version": model.get("schema_version", "1.1"),
                        "type_definitions": model.get("type_definitions", [])}, tmp)
            tmp_path = tmp.name

        result = subprocess.run(
            ["fga", "model", "validate", "--file", tmp_path],
            capture_output=True, text=True, timeout=10,
        )
        os.unlink(tmp_path)

        if result.returncode == 0:
            return jsonify({"valid": True})
        else:
            err = result.stderr.strip() or result.stdout.strip() or "Validation failed"
            return jsonify({"valid": False, "error": err})

    except subprocess.TimeoutExpired:
        return jsonify({"valid": False, "error": "fga validate timed out"})
    except Exception as e:
        return jsonify({"valid": False, "error": str(e)})


@app.route("/api/project/apply", methods=["POST"])
def api_project_apply():
    """Extract a project zip, parse FGA modules and tuple/test YAML files."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    uploaded = request.files["file"]
    if not uploaded.filename:
        return jsonify({"error": "Empty filename"}), 400

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, "project.zip")
            uploaded.save(zip_path)

            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(tmpdir)

            return jsonify(_process_project_dir(tmpdir))

    except zipfile.BadZipFile:
        return jsonify({"error": "Invalid zip file"}), 400
    except Exception as e:
        log.error("[PROJECT] Failed to process project: %s", e)
        return jsonify({"error": str(e)}), 500


def _process_project_dir(root_dir):
    """Walk the extracted project dir and build model + tuples + tests."""
    root = Path(root_dir)

    # Find fga.mod
    fga_mod_path = None
    for p in root.rglob("fga.mod"):
        fga_mod_path = p
        break

    # Determine the authz base directory
    if fga_mod_path:
        authz_dir = fga_mod_path.parent
    else:
        authz_dir = root

    # Collect .fga module files
    fga_files = []
    if fga_mod_path:
        mod_text = fga_mod_path.read_text(encoding="utf-8")
        mod_data = yaml.safe_load(mod_text)
        schema_version = str(mod_data.get("schema", "1.1"))
        for rel_path in mod_data.get("contents", []):
            fga_path = authz_dir / rel_path
            if fga_path.exists():
                fga_files.append((rel_path, fga_path.read_text(encoding="utf-8")))
    else:
        schema_version = "1.1"
        for fga_path in sorted(root.rglob("*.fga")):
            rel = str(fga_path.relative_to(root))
            fga_files.append((rel, fga_path.read_text(encoding="utf-8")))

    # Parse model from .fga files
    if fga_files:
        model = parse_fga_files(fga_files, schema_version=schema_version)
    else:
        model = {"schema_version": "1.1", "type_definitions": [{"type": "user"}]}

    # Collect tuples from YAML files in tuples/ directory
    tuples = []
    tuples_dir = authz_dir / "tuples"
    if tuples_dir.is_dir():
        for yaml_path in sorted(tuples_dir.glob("*.yaml")):
            try:
                data = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
                if isinstance(data, list):
                    for entry in data:
                        if _is_tuple_entry(entry):
                            tuples.append({
                                "user": str(entry["user"]),
                                "relation": str(entry["relation"]),
                                "object": str(entry["object"]),
                            })
            except Exception as e:
                log.warning("[PROJECT] Failed to parse tuples from %s: %s", yaml_path.name, e)

    # Collect tests from YAML files in tests/ directory
    tests = []
    tests_dir = authz_dir / "tests"
    if tests_dir.is_dir():
        for yaml_path in sorted(tests_dir.glob("*.yaml")):
            try:
                data = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
                if isinstance(data, dict) and "tests" in data:
                    file_tuples = _load_test_tuples(data, authz_dir)
                    for test_block in data["tests"]:
                        test_name = data.get("name", yaml_path.stem)
                        block_name = test_block.get("name", "")
                        full_name = test_name
                        if block_name:
                            full_name += " / " + block_name

                        # Extra tuples scoped to this test block
                        block_tuples = []
                        for t in test_block.get("tuples", []):
                            if _is_tuple_entry(t):
                                block_tuples.append({
                                    "user": str(t["user"]),
                                    "relation": str(t["relation"]),
                                    "object": str(t["object"]),
                                })

                        checks = _flatten_checks(test_block.get("check", []))
                        tests.append({
                            "name": full_name,
                            "source": "project",
                            "checks": checks,
                            "extraTuples": file_tuples + block_tuples,
                        })
            except Exception as e:
                log.warning("[PROJECT] Failed to parse tests from %s: %s", yaml_path.name, e)

    # Build file listing
    file_list = []
    for p in sorted(root.rglob("*")):
        if p.is_file() and p.name != "project.zip":
            file_list.append(str(p.relative_to(root)))

    return {
        "model": model,
        "tuples": tuples,
        "tests": tests,
        "files": file_list,
    }


def _is_tuple_entry(entry):
    """Check if a dict looks like a tuple entry."""
    return (
        isinstance(entry, dict)
        and "user" in entry
        and "relation" in entry
        and "object" in entry
    )


def _load_test_tuples(test_data, authz_dir):
    """Load tuples referenced by tuple_file or tuple_files in a test YAML."""
    tuples = []
    refs = []
    if "tuple_file" in test_data:
        refs.append(test_data["tuple_file"])
    if "tuple_files" in test_data:
        refs.extend(test_data["tuple_files"])

    for ref in refs:
        tpath = (authz_dir / ref).resolve()
        if tpath.exists():
            try:
                data = yaml.safe_load(tpath.read_text(encoding="utf-8"))
                if isinstance(data, list):
                    for entry in data:
                        if _is_tuple_entry(entry):
                            tuples.append({
                                "user": str(entry["user"]),
                                "relation": str(entry["relation"]),
                                "object": str(entry["object"]),
                            })
            except Exception:
                pass
    return tuples


def _flatten_checks(check_list):
    """Flatten the YAML check format into individual assertions.

    Input:  [{ user: "user:x", object: "doc:y", assertions: { viewer: true, editor: false } }]
    Output: [{ user: "user:x", relation: "viewer", object: "doc:y", expected: true }, ...]
    """
    result = []
    for entry in check_list:
        user = entry.get("user", "")
        obj = entry.get("object", "")
        for rel, expected in entry.get("assertions", {}).items():
            result.append({
                "user": user,
                "relation": rel,
                "object": obj,
                "expected": bool(expected),
            })
    return result


if __name__ == "__main__":
    port = int(os.environ.get("FLASK_RUN_PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
