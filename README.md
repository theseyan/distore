<div align="center">
    <br>
    <h1>Distore</h1><br>
    <i>Fast, unlimited, encrypted storage on Discord</i>
    <br><br>
</div>

Distore is a CLI tool to use Discord as your own encrypted file storage.<br>
It can also be consumed as a library through the [API](https://github.com/theseyan/distore/blob/main/lib/api.js).

## Get Started

1) Install with npm:
```shell
npm i -g distore
```
<br>

2) Run `distore` the first time to auto-generate an encryption key & configuration file `.distore/config.json` in your home directory.<br>
Distore requires a [Discord Webhook URL](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) and a [Deta Base](https://deta.space/docs/en/use/your-data/collections) collection key to work. You must update these entries in the configuration file before proceeding to the next step, or use the CLI:
```shell
distore config deta_api_key <YOUR_KEY>
distore config webhook <YOUR_URL>
```
<br>

3) Run `distore help` to get a list of commands and usage:

```console
Usage: Distore [options] [command]

Fast, unlimited, encrypted storage on Discord

Options:
  -V, --version                            output the version number
  -h, --help                               display help for command

Commands:
  upload [options] <path> [destination]    Uploads a file to the virtual filesystem
  download [options] <path> [destination]  Downloads a file from the virtual filesystem to disk
  delete <path>                            Deletes a file in the virtual filesystem
  config <item> <value>                    Updates the configuration file
  help [command]                           display help for command
```

## Why?
- Discord has no limits on file storage in a server
- Bypasses 25MiB file size limit by splitting files into chunks
- End-to-end encryption using 256 bit AES-GCM (Discord by default does **not** have E2EE)
- Guarantees file integrity and no tampering
- Parallely uploads/downloads chunks for maximising bandwidth

## Caveats
- **Do not** save sensitive, important files in Discord for archival, as Discord reserves the right to delete messages/servers/accounts at any time.
- **Do not** share your configuration file with untrusted third parties; Doing so will allow them full access to your virtual filesystem.

## License
Released under the [MIT](https://raw.githubusercontent.com/theseyan/distore/main/LICENSE.md) License.
