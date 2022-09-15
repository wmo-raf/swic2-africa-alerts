FROM node:16-bullseye-slim

ENV NAME swic2-africa
ENV USER microservice

RUN apt-get update -y && apt-get upgrade -y && \
    apt-get install -y bash build-essential

RUN addgroup $USER && useradd -ms /bin/bash $USER -g $USER
RUN yarn global add bunyan

RUN mkdir -p /opt/$NAME
COPY package.json /opt/$NAME/package.json
COPY yarn.lock /opt/$NAME/yarn.lock
RUN cd /opt/$NAME && yarn

COPY entrypoint.sh /opt/$NAME/entrypoint.sh
COPY config /opt/$NAME/config

WORKDIR /opt/$NAME

COPY --chown=$USER:$USER ./app /opt/$NAME/app

# Tell Docker we are going to use this ports
EXPOSE 3200

ADD https://github.com/ufoscout/docker-compose-wait/releases/download/2.2.1/wait /wait
RUN chmod +x /wait

CMD /wait

USER $USER

ENTRYPOINT ["./entrypoint.sh"]
