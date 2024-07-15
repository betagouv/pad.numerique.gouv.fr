FROM node:lts-slim

ENV PUPPETEER_SKIP_DOWNLOAD=true

EXPOSE 3000

RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends git ca-certificates

WORKDIR /app

COPY ./bin/heroku ./bin/heroku

RUN corepack enable yarn

COPY package.json yarn.lock .yarnrc.yml ./

COPY .yarn .yarn/

RUN yarn install

COPY . .

RUN npm run build

CMD ["npm", "run", "start"]
