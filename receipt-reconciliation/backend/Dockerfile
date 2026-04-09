FROM python:3.12-slim

# System deps for image processing and PDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc poppler-utils libmagic1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
