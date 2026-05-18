# OpenFGA Authorization Sample

A modular OpenFGA authorization model covering organizations, documents, and billing.

## Structure

```
authz/
  fga.mod                   Modular model entry point
  modules/
    core.fga                Base types: user, group, organization
    organizations.fga       Organization permissions
    documents.fga           Folder and document hierarchy
    billing.fga             Invoice and billing roles
  tests/
    documents.fga.yaml      Document access test cases
    billing.fga.yaml        Billing permission test cases
    revocation.fga.yaml     Revocation behavior tests
  tuples/
    global.test.yaml        Organization memberships and roles
    documents.test.yaml     Document/folder relationships
    billing.test.yaml       Invoice relationships
  store.local.fga.yaml      Local dev store configuration
```

## Usage

Requires the OpenFGA CLI (`fga`).

```bash
make validate    # Validate the modular model
make test        # Run all test cases
make transform   # Generate combined JSON model
```

For live OpenFGA server operations:

```bash
export FGA_STORE_ID=<store-id>
export FGA_MODEL_ID=<model-id>

make write       # Write model to store
make seed        # Import tuple files
make check       # Run a sample check
```
