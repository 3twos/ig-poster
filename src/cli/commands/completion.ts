import { CliError } from "../errors";

const COMMANDS = [
  "status",
  "auth",
  "assets",
  "brand-kits",
  "chat",
  "config",
  "generate",
  "photos",
  "mcp",
  "api",
  "posts",
  "publish",
  "queue",
  "watch",
  "link",
  "unlink",
  "completion",
  "help",
];

const GLOBAL_FLAGS = [
  "--flags-file",
  "--host",
  "--profile",
  "--json",
  "--stream-json",
  "--jq",
  "--timeout",
  "--quiet",
  "--dry-run",
  "--no-color",
  "--yes",
];

export const runCompletionCommand = async (argv: string[]) => {
  if (argv.length !== 1) {
    throw new CliError("Usage: ig completion <bash|zsh|fish>");
  }

  const [shell] = argv;

  switch (shell) {
    case "bash":
      process.stdout.write(buildBashCompletion());
      return;
    case "zsh":
      process.stdout.write(buildZshCompletion());
      return;
    case "fish":
      process.stdout.write(buildFishCompletion());
      return;
    default:
      throw new CliError("Usage: ig completion <bash|zsh|fish>");
  }
};

const buildBashCompletion = () => `#!/usr/bin/env bash
_ig() {
  local cur prev command i word
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  command=""

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${[...COMMANDS, ...GLOBAL_FLAGS].join(" ")}" -- "$cur") )
    return 0
  fi

  for (( i=1; i < \${COMP_CWORD}; i++ )); do
    word="\${COMP_WORDS[i]}"
    case "$word" in
      --flags-file|--host|--profile|--jq|--timeout)
        (( i++ ))
        ;;
      --*)
        ;;
      *)
        command="$word"
        break
        ;;
    esac
  done

  if [[ -z "$command" ]]; then
    COMPREPLY=( $(compgen -W "${[...COMMANDS, ...GLOBAL_FLAGS].join(" ")}" -- "$cur") )
    return 0
  fi

  case "$command" in
    auth)
      COMPREPLY=( $(compgen -W "login logout status test sessions" -- "$cur") )
      ;;
    assets)
      COMPREPLY=( $(compgen -W "upload" -- "$cur") )
      ;;
    brand-kits)
      COMPREPLY=( $(compgen -W "list get" -- "$cur") )
      ;;
    chat)
      COMPREPLY=( $(compgen -W "ask --post --message --history --temperature --system-prompt" -- "$cur") )
      ;;
    config)
      COMPREPLY=( $(compgen -W "list get set" -- "$cur") )
      ;;
    generate)
      COMPREPLY=( $(compgen -W "run refine" -- "$cur") )
      ;;
    photos)
      COMPREPLY=( $(compgen -W "pick recent search import propose --create-draft --since --limit --count --media --favorite --album --ids --folder --brand-kit --draft-title" -- "$cur") )
      ;;
    publish)
      COMPREPLY=( $(compgen -W "--image --video --carousel --cover --caption --caption-file --first-comment --schedule --location --location-id --connection --share-to-feed --no-share-to-feed" -- "$cur") )
      ;;
    posts)
      COMPREPLY=( $(compgen -W "list get create update duplicate archive" -- "$cur") )
      ;;
    queue)
      COMPREPLY=( $(compgen -W "list get cancel retry move-to-draft update" -- "$cur") )
      ;;
    watch)
      COMPREPLY=( $(compgen -W "--brand-kit --folder --interval --once" -- "$cur") )
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") )
      ;;
    mcp)
      COMPREPLY=()
      ;;
    *)
      COMPREPLY=()
      ;;
  esac
}
complete -F _ig ig
`;

const buildZshCompletion = () => `#compdef ig

local -a commands
commands=(
  'status:Show CLI status'
  'auth:Authentication commands'
  'assets:Asset commands'
  'brand-kits:Brand kit commands'
  'chat:Chat commands'
  'config:Configuration commands'
  'generate:Generation commands'
  'api:Raw API requests'
  'posts:Post commands'
  'publish:Publish media to Instagram'
  'queue:Publish queue commands'
  'watch:Watch a local directory and ingest assets'
  'mcp:Run the MCP stdio adapter'
  'link:Link the current repo'
  'unlink:Remove the current repo link'
  'completion:Print shell completion scripts'
  'help:Show help'
)

_arguments \
  '*::command:->command'

case $state in
  command)
    case $words[2] in
      auth)
        _values 'auth command' login logout status test sessions
        ;;
      assets)
        _values 'asset command' upload
        ;;
      brand-kits)
        _values 'brand kit command' list get
        ;;
      chat)
        _values 'chat command' ask --post --message --history --temperature --system-prompt
        ;;
      config)
        _values 'config command' list get set
        ;;
      generate)
        _values 'generate command' run refine
        ;;
      photos)
        _values 'photos command' pick recent search import propose --create-draft --since --limit --count --media --favorite --album --ids --folder --brand-kit --draft-title
        ;;
      publish)
        _values 'publish option' --image --video --carousel --cover --caption --caption-file --first-comment --schedule --location --location-id --connection --share-to-feed --no-share-to-feed
        ;;
      posts)
        _values 'post command' list get create update duplicate archive
        ;;
      queue)
        _values 'queue command' list get cancel retry move-to-draft update
        ;;
      watch)
        _values 'watch option' --brand-kit --folder --interval --once
        ;;
      completion)
        _values 'shell' bash zsh fish
        ;;
      mcp)
        _values 'mcp'
        ;;
      *)
        _describe 'command' commands
        ;;
    esac
    ;;
esac
`;

const buildFishCompletion = () => [
  "complete -c ig -f",
  ...COMMANDS.map((command) => `complete -c ig -n '__fish_use_subcommand' -a '${command}'`),
  "complete -c ig -n '__fish_seen_subcommand_from auth' -a 'login logout status test sessions'",
  "complete -c ig -n '__fish_seen_subcommand_from assets' -a 'upload'",
  "complete -c ig -n '__fish_seen_subcommand_from brand-kits' -a 'list get'",
  "complete -c ig -n '__fish_seen_subcommand_from chat' -a 'ask --post --message --history --temperature --system-prompt'",
  "complete -c ig -n '__fish_seen_subcommand_from config' -a 'list get set'",
  "complete -c ig -n '__fish_seen_subcommand_from generate' -a 'run refine'",
  "complete -c ig -n '__fish_seen_subcommand_from photos' -a 'pick recent search import propose --create-draft --since --limit --count --media --favorite --album --ids --folder --brand-kit --draft-title'",
  "complete -c ig -n '__fish_seen_subcommand_from publish' -a '--image --video --carousel --cover --caption --caption-file --first-comment --schedule --location --location-id --connection --share-to-feed --no-share-to-feed'",
  "complete -c ig -n '__fish_seen_subcommand_from posts' -a 'list get create update duplicate archive'",
  "complete -c ig -n '__fish_seen_subcommand_from queue' -a 'list get cancel retry move-to-draft update'",
  "complete -c ig -n '__fish_seen_subcommand_from watch' -a '--brand-kit --folder --interval --once'",
  "complete -c ig -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'",
  ...GLOBAL_FLAGS.map((flag) => `complete -c ig -l ${flag.slice(2)}`),
  "",
].join("\n");
