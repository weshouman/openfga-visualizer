.PHONY: start stop restart logs ps test

COMPOSE_FILE := docker-compose.yml
ENV_FILE := .env

-include $(ENV_FILE)
export

DC := docker-compose -f $(COMPOSE_FILE)

start:
	$(DC) up -d --build

stop:
	$(DC) down

restart: stop start

logs:
	$(DC) logs --tail=200

ps:
	$(DC) ps

test:
	@echo "Checking visualizer health..."
	@curl -fsS http://localhost:$${VISUALIZER_HTTP_PORT:-5090}/ > /dev/null && echo "Visualizer is running" || echo "Visualizer is not reachable"
