.PHONY: validate test transform write seed check revoke

FGA_STORE_ID ?=
FGA_MODEL_ID ?=
FGA_API_URL  ?= http://localhost:8080

export FGA_API_URL

validate:
	fga model validate --file authz/fga.mod --format modular

test:
	cd authz && fga model test --tests "tests/*.fga.yaml"

transform:
	fga model transform \
	  --file authz/fga.mod \
	  --input-format modular \
	  --output-format json > authz/model.generated.json

write:
	fga model write \
	  --store-id "$(FGA_STORE_ID)" \
	  --file authz/fga.mod \
	  --format modular

seed:
	fga tuple write \
	  --store-id "$(FGA_STORE_ID)" \
	  --model-id "$(FGA_MODEL_ID)" \
	  --file authz/tuples/global.test.yaml \
	  --on-duplicate ignore
	fga tuple write \
	  --store-id "$(FGA_STORE_ID)" \
	  --model-id "$(FGA_MODEL_ID)" \
	  --file authz/tuples/documents.test.yaml \
	  --on-duplicate ignore
	fga tuple write \
	  --store-id "$(FGA_STORE_ID)" \
	  --model-id "$(FGA_MODEL_ID)" \
	  --file authz/tuples/billing.test.yaml \
	  --on-duplicate ignore

check:
	fga query check \
	  --store-id "$(FGA_STORE_ID)" \
	  --model-id "$(FGA_MODEL_ID)" \
	  user:bob viewer document:roadmap

revoke:
	fga tuple delete \
	  --store-id "$(FGA_STORE_ID)" \
	  --model-id "$(FGA_MODEL_ID)" \
	  user:bob viewer document:secret \
	  --on-missing ignore
