# C–ATTS CLI

This CLI tool is a wrapper around the CATTS SDK. It allows you to develop, test and run C–ATTS recipes locally. The tool fetches query results, runs processor scripts, and validates schema items against the recipe's schema.

> [!NOTE]
> C–ATTS is a work in progress. Features and functionality may change without notice. C–ATTS has not yet been publicly released and is not yet ready for general use.

For some examples of recipes, see the [catts-recipes](https://github.com/c-atts/catts-recipes) repository.

## What is C–ATTS?

C–ATTS, or Composite Attestations, is a new type of attestation that combines data from multiple sources to form a unified and verifiable credential.

To learn more, see the [C–ATTS website](https://catts.run).

## Installation

Install the package globally to be able to use the `catts` command-line tool.

```bash
npm install -g catts-cli
```

## CLI Usage

### Querying

To fetch query results from a recipe, use the `query` command:

```bash
catts query <recipeFolder>
```

The `query` command will fetch the query results from the specified recipe and print them to the console. You can optionally specify the index of the query to run:

```bash
catts query <recipeFolder> -i <index>
```

To get more detailed output, including verbose logging, use the -v or --verbose option:

```bash
catts query <recipeFolder> -v
```

### Running

To run a recipe, use the `run` command:

```bash
catts run <recipeFolder>
```

The `run` command will fetch the query results from the specified recipe, run the processor script, validate the schema items against the recipe's schema, and print the results to the console.

To get more detailed output, including verbose logging, use the `-v` or `--verbose` option:

```bash
catts run <recipeFolder> -v
```

### Customizing the user address

The CLI needs to know a user address to fetch query results. By default, the SDK uses the `USER_ETH_ADDRESS` environment variable to fetch query results. If you want to use a different address, you can pass the `-e` or `--eth-address` option to the `query` or `run` commands. Alternatively, you can create a `.env` file in the root of your project with the `USER_ETH_ADDRESS` variable set to the desired address.

```bash
catts query <recipeFolder> -e <address>
catts run <recipeFolder> -e <address>
```

## Author

- [kristofer@kristoferlund.se](mailto:kristofer@kristoferlund.se)
- Twitter: [@kristoferlund](https://twitter.com/kristoferlund)
- Discord: kristoferkristofer
- Telegram: [@kristoferkristofer](https://t.me/kristoferkristofer)

## License

This project is licensed under the MIT License. See the LICENSE file for more details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request if you have any suggestions or improvements.
