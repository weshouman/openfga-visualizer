FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY fga_parser.py .
COPY config/ config/
COPY templates/ templates/
COPY static/ static/

CMD ["flask", "--app", "app", "run"]
