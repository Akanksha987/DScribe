FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    DSCRIBE_DB=/var/data/patients.db
WORKDIR /app/server
COPY server/app.py ./app.py
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=frontend /app/dist /app/dist
EXPOSE 8000
CMD ["python", "app.py"]
