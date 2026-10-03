FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html index.css manifest.json sw.js icon.svg icon-192.png icon-512.png apple-touch-icon.png /usr/share/nginx/html/
COPY js /usr/share/nginx/html/js
COPY vendor /usr/share/nginx/html/vendor
COPY fonts /usr/share/nginx/html/fonts

EXPOSE 80
