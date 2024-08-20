#!/usr/bin/env node

import "dotenv/config";

import * as fs from "fs";
import * as path from "path";

import {
  Recipe,
  fetchQuery,
  getSchemaUid,
  parseRecipe,
  validateProcessorResult,
  validateSchemaItems,
} from "catts-sdk";

import { Command } from "commander";
import RELEASE_SYNC from "@jitl/quickjs-wasmfile-release-sync";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";

let verbose = false;
let ethAddressOption = process.env.USER_ETH_ADDRESS;

async function importRecipe(recipeFolder: string): Promise<Recipe> {
  const recipePath = path.join(recipeFolder, "recipe.json");

  if (!fs.existsSync(recipePath)) {
    throw new Error(`Recipe file not found: ${recipePath}`);
  }

  const absolutePath = path.resolve(recipePath);
  const recipeImport = await import(absolutePath);
  return parseRecipe(recipeImport.default);
}

// Loads and wraps the processor script for execution in QuickJS VM.
async function loadProcessor(recipeFolder: string): Promise<string> {
  const processorPath = path.join(recipeFolder, "processor.js");
  return fs.promises.readFile(processorPath, "utf8");
}

// Unified error logging function.
function logError(error: unknown): void {
  if (typeof error === "object" && error !== null) {
    if ("name" in error) console.log(error.name);
    if ("message" in error) console.log(error.message);
    if (verbose && error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  } else {
    console.error(error);
  }
}

type QueryCommandOptions = {
  index?: number;
};

function write(text: string) {
  process.stdout.write(text);
}

function writeln(text: string) {
  process.stdout.write(text + "\n");
}

async function queryCommand(
  recipeFolder: string,
  options?: QueryCommandOptions
) {
  try {
    const recipe = await importRecipe(recipeFolder);
    console.log("\nRecipe:", recipe.name);

    let queryResults;
    if (options?.index !== undefined) {
      write(`\nRunning query with index: ${options.index} `);
      const query = recipe.queries[options.index];
      queryResults = await fetchQuery({
        query,
        verbose,
        placeHolderValues: {
          userEthAddress: ethAddressOption,
        },
      });
    } else {
      write("\nRunning all queries:\n");
      const queryPromises = recipe.queries.map(
        (q) =>
          (queryResults = fetchQuery({
            query: q,
            verbose,
            placeHolderValues: {
              userEthAddress: ethAddressOption,
            },
          }))
      );
      queryResults = await Promise.all(queryPromises);
    }

    writeln("✅\n");
    console.log(JSON.stringify(queryResults, null, 2));
  } catch (error) {
    console.log("\n🛑 Query failed");
    logError(error);
  }
}

/**
 * Runs the processor script against the query results and returns the result.
 *
 * @param processor The processor javascript code to be executed.
 * @param queryResults An array of query results in JSON format.
 *
 * @returns The raw result of the processor script as a string.
 */
async function runProcessor({
  processor,
  queryResults,
}: {
  processor: string;
  queryResults: any;
}): Promise<string> {
  const QuickJS = await newQuickJSWASMModuleFromVariant(RELEASE_SYNC);
  const vm = QuickJS.newContext();

  try {
    // Add the queryResultRaw property to the global object
    const queryResultRaw = vm.newString(JSON.stringify(queryResults));
    vm.setProp(vm.global, "queryResultRaw", queryResultRaw);
    queryResultRaw.dispose();

    // Add console.log function to the global object
    const logFn = vm.newFunction("log", (...args) => {
      console.log(...args.map((arg) => vm.dump(arg)));
    });
    const consoleObj = vm.newObject();
    vm.setProp(consoleObj, "log", logFn);
    vm.setProp(vm.global, "console", consoleObj);
    logFn.dispose();
    consoleObj.dispose();

    processor = `
      let queryResult = JSON.parse(queryResultRaw);
      function process() {{
        ${processor}
      }}
      process();
    `;

    const result = vm.evalCode(processor);
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw error;
    }

    const value = vm.dump(result.value);
    result.value.dispose();
    return value;
  } catch (error) {
    throw error;
  } finally {
    vm.dispose();
  }
}

async function runCommand(recipeFolder: string) {
  try {
    const recipe = await importRecipe(recipeFolder);
    console.log("\nRecipe:", recipe.name);

    write("\n1/4 Running graphql queries... ");
    const queryPromises = recipe.queries.map((q) =>
      fetchQuery({
        query: q,
        verbose,
        placeHolderValues: { userEthAddress: ethAddressOption },
      })
    );
    const queryResults = await Promise.all(queryPromises);
    writeln("✅");

    if (verbose) {
      writeln("\nQuery results:");
      writeln(JSON.stringify(queryResults, null, 2));
    }

    writeln("\n2/4 Running processor... ");
    const processor = await loadProcessor(recipeFolder);
    const processorResult = await runProcessor({
      processor,
      queryResults,
    });
    writeln("✅");

    if (verbose) {
      writeln("\nProcessor result:");
      writeln(processorResult);
    }

    write("\n3/4 Validating processor result... ");
    const schemaItems = await validateProcessorResult({
      processorResult,
    });
    writeln("✅");

    if (verbose) {
      writeln("\nSchema items:");
      writeln(JSON.stringify(schemaItems, null, 2));
      console.log("Schema:", recipe.schema);
      console.log(
        "Schema UID:",
        getSchemaUid({
          schema: recipe.schema,
          resolver: recipe.resolver,
          revokable: recipe.revokable,
        })
      );
    }

    write("\n4/4 Validating schema items against schema... ");
    const schema = await validateSchemaItems({
      schemaItems,
      schema: recipe.schema,
    });
    writeln("✅\n");

    console.log("💥 Done! Recipe is ready to be deployed.");
  } catch (error) {
    console.log("🛑 Run failed");
    logError(error);
  }
}

const program = new Command();
program
  .version("0.0.8")
  .name("catts")
  .description("Supports the development of C-ATTS recipes.")
  .option(
    "-e, --eth-address <address>",
    "Ethereum address to use for queries. Defaults to the value of the USER_ETH_ADDRESS environment variable."
  )
  .option("-v, --verbose", "Enable verbose output");

program.hook("preAction", async (thisCommand) => {
  // Set verbose flag
  verbose = thisCommand.opts().verbose;

  // If -e option is set, override process.env.USER_ETH_ADDRESS
  if (thisCommand.opts().ethAddress) {
    ethAddressOption = thisCommand.opts().ethAddress;
  }

  // Ensure USER_ETH_ADDRESS is set
  if (!ethAddressOption) {
    console.error(
      "Error: USER_ETH_ADDRESS needs to be set, either via the -e option or by creating a .env file with USER_ETH_ADDRESS set. Place the .env file in the root of the project."
    );
    process.exit(1);
  }
});

program
  .command("query")
  .argument("<recipeFolder>", "Path to the recipe folder.")
  .option(
    "-i, --index <index>",
    "Index of query to run. Omit to run all queries"
  )
  .description("Fetch the query results from the specified recipe.")
  .action(async (recipeFolder, options) => {
    await queryCommand(recipeFolder, options);
  });

program
  .command("run")
  .argument("<recipeFolder>", "Path to the recipe folder.")
  .description("Run the specified recipe.")
  .action(async (recipeFolder) => {
    await runCommand(recipeFolder);
  });

program.parse(process.argv);
