#!/usr/bin/env bash
set -euo pipefail

: "${HOME:?HOME is not set}"

abort() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

expand_path() {
  case "$1" in
    "~")
      printf '%s\n' "$HOME"
      ;;
    "~/"*)
      printf '%s/%s\n' "$HOME" "${1#~/}"
      ;;
    *)
      printf '%s\n' "$1"
      ;;
  esac
}

resolve_config_dir() {
  if [ -n "${HOWL_CONFIG:-}" ]; then
    expand_path "$HOWL_CONFIG"
    return
  fi
  if [ -n "${CLAUDECLAW_CONFIG:-}" ]; then
    expand_path "$CLAUDECLAW_CONFIG"
    return
  fi
  if [ -n "${XDG_CONFIG_HOME:-}" ]; then
    printf '%s\n' "$XDG_CONFIG_HOME/howl-pa"
    return
  fi
  if [ -d "$HOME/.claudeclaw" ]; then
    printf '%s\n' "$HOME/.claudeclaw"
    return
  fi
  printf '%s\n' "$HOME/.config/howl-pa"
}

prompt_hidden() {
  prompt_result=""
  printf '%s' "$1"
  if [ -t 0 ]; then
    stty_state=$(stty -g)
    stty -echo
    IFS= read -r prompt_result || true
    stty "$stty_state"
    printf '\n'
  else
    IFS= read -r prompt_result || true
  fi
}

prompt_plain() {
  prompt_result=""
  printf '%s' "$1"
  IFS= read -r prompt_result || true
}

# Check Node
command -v node >/dev/null 2>&1 || abort "Node.js >= 22 is required. Install via fnm / nvm / nodesource first."
command -v npm >/dev/null 2>&1 || abort "npm is required."

node_major=$(node -p "Number.parseInt(process.versions.node.split('.')[0], 10)")
if [ "$node_major" -lt 22 ]; then
  abort "Howl PA needs Node 22+. Install via fnm / nvm / nodesource first. Found: $(node -v)"
fi

printf 'Installing howl-pa@latest...\n'
npm install -g howl-pa@latest

config_dir=$(resolve_config_dir)
env_path="$config_dir/.env"

if [ -e "$env_path" ]; then
  abort ".env already exists at $env_path. Run \`howl-pa setup\` to edit."
fi

# Gather credentials
prompt_hidden "Telegram bot token (@BotFather): "
telegram_bot_token=$prompt_result
[ -n "$telegram_bot_token" ] || abort "Telegram bot token is required."

prompt_plain "Your Telegram chat ID (@userinfobot): "
telegram_chat_id=$prompt_result
printf '%s' "$telegram_chat_id" | grep -Eq '^-?[0-9]+$' || abort "Telegram chat ID must be an integer."

prompt_hidden "Claude Code OAuth token (run \`claude setup-token\`): "
claude_oauth_token=$prompt_result
[ -n "$claude_oauth_token" ] || abort "Claude Code OAuth token is required."

prompt_plain "Vault path [~/Documents/vault]: "
vault_path=$prompt_result
if [ -z "$vault_path" ]; then
  vault_path="~/Documents/vault"
fi

# Optional dashboard password
dashboard_password_salt=""
dashboard_password_hash=""
prompt_plain "Set a dashboard password? [y/N]: "
set_password=$prompt_result
if [ "$set_password" = "y" ] || [ "$set_password" = "Y" ]; then
  prompt_hidden "Dashboard password (min 8 chars, 1+ digit): "
  dashboard_password=$prompt_result
  if [ "${#dashboard_password}" -lt 8 ]; then
    abort "Dashboard password must be at least 8 characters."
  fi
  case "$dashboard_password" in
    *[0-9]*) ;;
    *) abort "Dashboard password must contain at least one digit." ;;
  esac

  prompt_hidden "Confirm dashboard password: "
  dashboard_password_confirm=$prompt_result
  if [ "$dashboard_password" != "$dashboard_password_confirm" ]; then
    abort "Passwords do not match."
  fi

  dashboard_password_salt=$(node -e 'console.log(require("node:crypto").randomBytes(16).toString("hex"))')
  dashboard_password_hash=$(
    HOWL_SALT="$dashboard_password_salt" HOWL_PW="$dashboard_password" \
    node -e 'const c=require("node:crypto");console.log(c.createHash("sha256").update(process.env.HOWL_SALT+":"+process.env.HOWL_PW).digest("hex"))'
  )
fi

# Generate token
dashboard_token=$(node -e 'console.log(require("node:crypto").randomBytes(24).toString("base64url"))')
dashboard_host="127.0.0.1"
dashboard_port="3141"
dashboard_username="howl"

# Write .env
mkdir -p "$config_dir"
old_umask=$(umask)
umask 077
{
  printf 'TELEGRAM_BOT_TOKEN=%s\n' "$telegram_bot_token"
  printf 'ALLOWED_CHAT_ID=%s\n' "$telegram_chat_id"
  printf 'CLAUDE_CODE_OAUTH_TOKEN=%s\n' "$claude_oauth_token"
  printf 'VAULT_PATH=%s\n' "$vault_path"
  printf 'DASHBOARD_TOKEN=%s\n' "$dashboard_token"
  printf 'DASHBOARD_HOST=%s\n' "$dashboard_host"
  printf 'DASHBOARD_PORT=%s\n' "$dashboard_port"
  printf 'DASHBOARD_USERNAME=%s\n' "$dashboard_username"
  printf 'OLLAMA_URL=%s\n' "http://localhost:11434"
  printf 'OLLAMA_EMBED_MODEL=%s\n' "nomic-embed-text"
  if [ -n "$dashboard_password_hash" ]; then
    printf 'DASHBOARD_PASSWORD_SALT=%s\n' "$dashboard_password_salt"
    printf 'DASHBOARD_PASSWORD_HASH=%s\n' "$dashboard_password_hash"
  fi
} > "$env_path"
umask "$old_umask"
chmod 600 "$env_path"

dashboard_url="http://$dashboard_host:$dashboard_port/?token=$dashboard_token"
vault_expanded=$(expand_path "$vault_path")

printf '\n'
printf '  Howl PA installed\n'
printf 'Config:    %s\n' "$config_dir"
printf 'Vault:     %s\n' "$vault_expanded"
printf 'Start:     howl-pa start\n'
printf 'Background: howl-pa daemon install   (systemd --user)\n'
printf 'Dashboard: %s\n' "$dashboard_url"
