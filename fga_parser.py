"""Parser for OpenFGA DSL (.fga) files.

Converts modular .fga files into the JSON authorization model format
expected by the OpenFGA API and the visualizer frontend.

Supports: type, extend type, module (ignored), define with direct types,
computed userset, union (or), and tuple-to-userset (from).
"""

import re


def parse_fga_files(file_contents, schema_version="1.1"):
    """Parse multiple .fga file contents into a single JSON model.

    Args:
        file_contents: list of (filename, text) tuples
        schema_version: schema version string for the output

    Returns:
        dict with schema_version and type_definitions
    """
    # Collect all type definitions across files, merging extend types
    types = {}  # name -> { relations: {name: def}, meta: {name: types} }
    type_order = []

    for filename, text in file_contents:
        _parse_single_file(text, types, type_order)

    # Build the JSON model
    type_defs = []
    for tname in type_order:
        tdata = types[tname]
        td = {"type": tname}

        if tdata["relations"]:
            td["relations"] = {}
            meta_rels = {}

            for rname in tdata["rel_order"]:
                rdef = tdata["relations"][rname]
                td["relations"][rname] = rdef["rewrite"]

                if rdef["allowed_types"]:
                    meta_rels[rname] = {
                        "directly_related_user_types": rdef["allowed_types"]
                    }

            if meta_rels:
                td["metadata"] = {"relations": meta_rels}

        type_defs.append(td)

    return {
        "schema_version": schema_version,
        "type_definitions": type_defs,
    }


def _parse_single_file(text, types, type_order):
    """Parse a single .fga file and merge into the types dict."""
    lines = text.split("\n")
    current_type = None
    in_relations = False

    for raw_line in lines:
        line = raw_line.strip()

        # Skip empty lines and comments
        if not line or line.startswith("#") or line.startswith("//"):
            continue

        # module declaration (ignored for model output)
        if line.startswith("module "):
            continue

        # condition declaration (skip for now)
        if line.startswith("condition "):
            continue

        # type declaration
        type_match = re.match(r"^(extend\s+)?type\s+(\w+)$", line)
        if type_match:
            tname = type_match.group(2)
            if tname not in types:
                types[tname] = {
                    "relations": {},
                    "rel_order": [],
                }
                type_order.append(tname)
            current_type = tname
            in_relations = False
            continue

        # relations block
        if line == "relations":
            in_relations = True
            continue

        # define statement
        if line.startswith("define ") and in_relations and current_type:
            _parse_define(line, types[current_type])
            continue


def _parse_define(line, type_data):
    """Parse a define line and add the relation to type_data."""
    # define <name>: <definition>
    m = re.match(r"^define\s+(\w+)\s*:\s*(.+)$", line)
    if not m:
        return

    rel_name = m.group(1)
    definition = m.group(2).strip()

    allowed_types = []
    rewrite_parts = []

    # Split by " or " to get parts
    # But first, extract the direct type list [...]  if present
    direct_match = re.match(r"^\[([^\]]+)\](.*)$", definition)
    if direct_match:
        # Parse type list
        type_list_str = direct_match.group(1)
        allowed_types = _parse_type_list(type_list_str)
        rewrite_parts.append({"this": {}})

        remainder = direct_match.group(2).strip()
        if remainder.startswith("or "):
            remainder = remainder[3:]
        elif remainder:
            remainder = remainder.lstrip()
        # Parse remaining parts after the type list
        if remainder:
            parts = _split_or(remainder)
            for part in parts:
                rewrite_parts.append(_parse_rewrite_part(part))
    else:
        # No direct type list -- all parts are computed/ttu
        parts = _split_or(definition)
        for part in parts:
            rewrite_parts.append(_parse_rewrite_part(part))

    # Build the final rewrite rule
    if len(rewrite_parts) == 1:
        rewrite = rewrite_parts[0]
    else:
        rewrite = {"union": {"child": rewrite_parts}}

    type_data["relations"][rel_name] = {
        "rewrite": rewrite,
        "allowed_types": allowed_types,
    }
    if rel_name not in type_data["rel_order"]:
        type_data["rel_order"].append(rel_name)


def _split_or(text):
    """Split a definition string by ' or ', respecting brackets."""
    parts = []
    current = []
    depth = 0
    tokens = text.split(" ")
    for token in tokens:
        depth += token.count("[") - token.count("]")
        if token == "or" and depth == 0 and current:
            parts.append(" ".join(current))
            current = []
        else:
            current.append(token)
    if current:
        parts.append(" ".join(current))
    return parts


def _parse_type_list(type_list_str):
    """Parse a comma-separated type list like 'user, group#member'."""
    result = []
    for item in type_list_str.split(","):
        item = item.strip()
        if not item:
            continue
        if "#" in item:
            tname, rel = item.split("#", 1)
            result.append({"type": tname.strip(), "relation": rel.strip()})
        else:
            result.append({"type": item})
    return result


def _parse_rewrite_part(part):
    """Parse a single rewrite part (after splitting by 'or').

    Handles:
      - '<rel> from <parent>' -> tupleToUserset
      - '<rel>' -> computedUserset
    """
    part = part.strip()

    # tuple-to-userset: <relation> from <tupleset_relation>
    from_match = re.match(r"^(\w+)\s+from\s+(\w+)$", part)
    if from_match:
        return {
            "tupleToUserset": {
                "tupleset": {"relation": from_match.group(2)},
                "computedUserset": {"relation": from_match.group(1)},
            }
        }

    # computed userset: just a relation name
    if re.match(r"^\w+$", part):
        return {"computedUserset": {"relation": part}}

    # Fallback: treat as computed userset
    return {"computedUserset": {"relation": part}}
