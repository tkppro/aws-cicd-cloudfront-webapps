import * as fs from "fs";
import * as dotenv from "dotenv";
import * as path from "path";
import * as yaml from "yaml";

export const loadEnvironmentVariablesFile = (
  mode: "dev" | "prod",
  envDirPath = path.join(process.cwd(), "env")
) => {
  const baseYaml = fs.readFileSync(path.join(envDirPath, ".base.yaml"), "utf-8");
  const modeYaml = fs.readFileSync(
    path.join(envDirPath, mode === "prod" ? ".prod.yaml" : ".dev.yaml"),
    "utf-8"
  );
  
  const baseObj = yaml.parse(baseYaml);
  const modeObj = yaml.parse(modeYaml);
  
  return Object.assign({}, baseObj, modeObj);
};
  

export const configLocalEnvironmentFile = (
  mode: "dev" | "prod",
  envDirPath: string = path.join(process.cwd(), "env")
) => {
  dotenv.config({ path: envDirPath+`/.${mode}.env` });
}
