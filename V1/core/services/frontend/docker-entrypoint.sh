#!/bin/sh
# Ativa SSL apenas quando certificados existem (evita erro de nginx sem certs)
if [ -f /etc/nginx/ssl/origin.pem ] && [ -f /etc/nginx/ssl/origin.key ]; then
  cp /etc/nginx/conf.d/nginx-ssl.conf.disabled /etc/nginx/conf.d/nginx-ssl.conf
fi
exec nginx -g "daemon off;"
