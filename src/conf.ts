import { workspace } from "vscode";


export let FILTER_PATTERNS: RegExp[] = [];


export enum Config {
    filterFilePatterns = "filterFilePatterns",
    filterProjectFileGlobPatterns = "filterProjectFileGlobPatterns"
}

export function getConfig<T>(item: Config): T | undefined {
    return workspace.getConfiguration("lgf-file-browser").get(item);
}

export function loadConf() {
    // let hideDotfiles: boolean = getConfig(Config.hideDotfiles)!;
    // HIDE_DOT_FILES = hideDotfiles;
    let filterPatterns: string[] = getConfig(Config.filterFilePatterns)!;
    filterPatterns.forEach((patternStr) => {
        FILTER_PATTERNS.push(new RegExp(patternStr));
    });
}