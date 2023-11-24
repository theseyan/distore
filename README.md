<div align="center">
    <br>
    <h1>Distore</h1><br>
    <i>Fast, unlimited, encrypted storage on Discord!</i>
    <br><br>
</div>

Distore is a CLI tool to use Discord as an encrypted virtual filesystem.<br>
It can also be consumed as a library through the [API](https://github.com/theseyan/distore/blob/main/lib/api.js).

## Get Started

- Install with npm:
```
npm i distore
```

- Run `distore` the first time to auto-generate an encryption key & configuration file `.distore/config.json` in your home directory.<br>
Distore requires a [Discord Webhook URL](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) and a [Deta Base](https://deta.space/docs/en/use/your-data/collections) collection key to work. You must update these entries in the configuration file before proceeding to the next step.

- Run `distore help` to get a list of commands and usage:

```console
Usage: Distore [options] [command]

Fast, unlimited, encrypted storage on Discord

Options:
  -V, --version                            output the version number
  -h, --help                               display help for command

Commands:
  upload [options] <path> [destination]    Uploads a file to the virtual filesystem
  download [options] <path> [destination]  Downloads a file from the virtual filesystem to disk
  config <item> <value>                    Updates the configuration file
  help [command]                           display help for command
```

## Why?
- Discord has no limits on file storage in a server
- Bypasses 25MiB file size limit by splitting files into chunks
- End-to-end encryption using 256 bit AES-GCM (Discord does **not** use E2EE)
- Guarantees file integrity and no tampering
- Parallely uploads/downloads chunks for maximising bandwidth

## License
Released under the [MIT](https://raw.githubusercontent.com/theseyan/distore/main/LICENSE.md) License.