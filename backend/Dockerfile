FROM node:20-alpine

# Рабочая директория внутри контейнера
WORKDIR /app

# Сначала копируем только package.json, чтобы кэшировался npm install
COPY package.json package-lock.json* ./

# Устанавливаем зависимости (в том числе express)
RUN npm install --omit=dev

# Теперь копируем остальной код
COPY . .

EXPOSE 3000

# Запуск приложения
CMD ["node", "server.js"]
