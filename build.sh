NODE_OPTIONS=--openssl-legacy-provider npm run build
sudo systemctl restart tccd
sleep 1
journalctl -u tccd
