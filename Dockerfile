FROM node:alpine

COPY app /app/

COPY entrypoint.sh /

WORKDIR /app/

RUN yarn

ENTRYPOINT [ "/entrypoint.sh" ]
