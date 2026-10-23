# Novera

Novera is an independent public AI assistant developed by TRON-ABS, based on [Jan](https://github.com/janhq/jan). Its direction is to make knowledge and evolving AI capabilities accessible through local and cloud models.

Repository: [TRON-ABS/Novera](https://github.com/TRON-ABS/Novera).

## Interface languages

**36 interface locales are available in source**, including the 19 language contributions now integrated into Novera. [See every language, native label, translation coverage and source contribution](docs/LANGUAGES.md).

New catalogs: Amharic, Modern Standard Arabic, Egyptian Arabic, Bengali, Cantonese, Hausa, Iranian Persian, Javanese, Marathi, Nigerian Pidgin, Portuguese (Portugal), Swahili, Tagalog, Tamil, Telugu, Thai, Urdu, Western Punjabi and partial Wu (Shanghainese). Existing languages and script variants are retained.

The 18 full new catalogs cover all 1,463 current English keys. Wu covers 706 keys and falls back to English for missing text. Native-speaker review remains outstanding. This describes the interface; model language capabilities depend on the selected model.

## Project status

Novera identity and language support are maintained in this source repository. No Novera binary has been built or released. Existing Jan releases and installers are not Novera releases.

Automatic application updates are disabled until Novera has its own signing key, release feed and distribution process. GitHub Actions is disabled while builds are on hold.

## Development

The project retains the React/TypeScript interface, Rust/Tauri desktop application, local inference plugins, and MCP integrations inherited from Jan. Internal `@janhq/*` package names, Rust library/package names, assistant IDs and some protocol identifiers remain for compatibility; they do not imply affiliation with Jan.

Novera uses a separate application identifier (`io.github.tronabs.novera`), default `Novera` data directory and provider keyring namespace. Existing Jan data is not automatically moved or deleted. Import and migration require a separate reviewed step before using existing profiles.

See [the transition record](NOVERA.md), [contribution policy](CONTRIBUTING.md) and [upstream build documentation](docs/UPSTREAM_JAN_README.md). Build instructions are reference material; no build is requested as part of this transition.

## Attribution and license

Novera derives from Jan by Menlo Research and its contributors. Original attribution and the [Apache License 2.0](LICENSE) are retained. Public source and closed pull requests remain accessible; closing a pull request does not make its code exclusive.
