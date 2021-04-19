FROM node:alpine

COPY app /app/

WORKDIR /app/

RUN yarn

ENTRYPOINT [ "yarn", "start" ]
