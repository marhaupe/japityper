import * as fs from "fs";
import * as clipboardy from "clipboardy";
import { Deserializer } from "ts-jsonapi";
import { Command, flags } from "@oclif/command";
import {
  quicktype,
  InputData,
  jsonInputForTargetLanguage,
} from "quicktype-core";

// Quicktype doesn't let you opt out of generating some code,
// so we have to do that ourselves.
function removeUnwantedLines(lines: string[]): string[] {
  const strippedLines = [...lines];

  // Delete the first few lines that are only comments
  strippedLines.splice(
    0,
    strippedLines.findIndex((line) => !line.startsWith("//"))
  );

  // The second half of the generated code consists of a Converter class.
  // This is only useful for certain output languages, e.g. TypeScript.
  strippedLines.splice(
    strippedLines.indexOf("// Converts JSON strings to/from your types")
  );
  return strippedLines;
}

class Japityper extends Command {
  static description =
    "reads JSON:API content from your clipboard and generates types for the deserialized content";

  static flags = {
    version: flags.version({ char: "v" }),
    help: flags.help({ char: "h" }),
    language: flags.string({
      char: "l",
      default: "ts",
      description: "language of generated code",
    }),
    "root-type": flags.string({
      char: "r",
      description: "root type name",
      default: "Root",
    }),
    input: flags.string({
      char: "i",
      description: "input file",
      multiple: true,
    }),
    "skip-deserialize": flags.boolean({
      char: "s",
      description: "skip deserialization",
      default: false,
    }),
  };

  static args = [
    {
      name: "output",
      required: false,
      description:
        "output file. If this is not provided, your clipboard will be overwritten with the generated code",
    },
  ];

  async run() {
    const { args, flags } = this.parse(Japityper);

    let stringInput: string[] = [];
    if (flags.input) {
      try {
        stringInput = flags.input.map((inputFile: string) =>
          fs.readFileSync(inputFile, { encoding: "utf8" })
        );
      } catch (error) {
        this.error("reading input files failed. " + error.message);
      }
    } else {
      let clipboardContent = clipboardy.readSync();
      clipboardContent = clipboardContent.trimStart();
      stringInput = [clipboardContent];
    }

    let parsedStringInput: any[] = [];
    try {
      parsedStringInput = stringInput.map((i) => JSON.parse(i));
    } catch (error) {
      this.error("parsing data failed. " + error.message);
    }

    const deserializer = new Deserializer({
      keyForAttribute: (key: string) => key,
    });

    let deserializedInput: any[] = [];
    if (flags["skip-deserialize"]) {
      deserializedInput = parsedStringInput;
    } else {
      try {
        deserializedInput = parsedStringInput.map((i) =>
          deserializer.deserialize(i)
        );
      } catch (error) {
        this.error("deserializing failed. " + error.message);
      }
    }

    const stringifiedDeserializedInput = deserializedInput.map((i) =>
      JSON.stringify(i)
    );

    const jsonInput = jsonInputForTargetLanguage(flags.language);

    await jsonInput.addSource({
      name: flags["root-type"],
      samples: stringifiedDeserializedInput,
    });

    const inputData = new InputData();
    inputData.addInput(jsonInput);

    let { lines } = await quicktype({
      inputData,
      lang: flags.language,
      allPropertiesOptional: true,
      combineClasses: true,
      inferMaps: true,
      inferEnums: true,
    });

    lines = removeUnwantedLines(lines);

    const output = lines.join("\n");
    if (args.file) {
      fs.writeFileSync(args.file, output);
    } else {
      clipboardy.writeSync(output);
    }
  }
}

export = Japityper;
