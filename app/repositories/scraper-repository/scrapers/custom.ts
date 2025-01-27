import { Response } from "got";

import { PaperFolder, PaperTag } from "@/models/categorizer";
import { PaperEntity } from "@/models/paper-entity";
import { Preference, ScraperPreference } from "@/preference/preference";
import { MainRendererStateStore } from "@/state/renderer/appstate";

import { Scraper, ScraperRequestType, ScraperType } from "./scraper";

export class CustomScraper extends Scraper {
  name = "";

  tagClass: typeof PaperTag;
  folderClass: typeof PaperFolder;

  constructor(
    stateStore: MainRendererStateStore,
    preference: Preference,
    name: string
  ) {
    super(stateStore, preference);

    this.name = name;
    this.tagClass = PaperTag;
    this.folderClass = PaperFolder;
  }

  preProcess(paperEntityDraft: PaperEntity): ScraperRequestType {
    let enable = this.getEnable(this.name);
    let scrapeURL = `https://httpbin.org/get`;
    let headers = {};
    const preProcessCode = (
      this.preference.get("scrapers") as Record<string, ScraperPreference>
    )[this.name]?.preProcessCode;

    if (preProcessCode) {
      eval(preProcessCode);
    } else {
      enable = false;
    }

    if (enable) {
      this.stateStore.logState.processLog = `Scraping metadata from ${this.name}...`;
    }

    return { scrapeURL, headers, enable };
  }

  parsingProcess(
    rawResponse: Response<string>,
    paperEntityDraft: PaperEntity
  ): PaperEntity {
    const parsingProcessCode = (
      this.preference.get("scrapers") as Record<string, ScraperPreference>
    )[this.name]?.parsingProcessCode;

    if (parsingProcessCode) {
      eval(parsingProcessCode);
    }

    return paperEntityDraft;
  }
  scrapeImpl = scrapeImpl;
}

async function scrapeImpl(
  this: ScraperType,
  paperEntityDraft: PaperEntity
): Promise<PaperEntity> {
  let scrapeImplCode =
    (this.preference.get("scrapers") as Record<string, ScraperPreference>)[
      // @ts-ignore
      this.name
    ]?.scrapeImplCode || "";

  scrapeImplCode = scrapeImplCode.replaceAll("return", "paperEntityDraft = ");

  if (scrapeImplCode) {
    eval(scrapeImplCode);
  } else {
    const { scrapeURL, headers, enable } = this.preProcess(
      paperEntityDraft
    ) as ScraperRequestType;

    if (enable) {
      const response = (await window.networkTool.get(
        scrapeURL,
        headers
      )) as Response<string>;
      return this.parsingProcess(response, paperEntityDraft) as PaperEntity;
    } else {
      return paperEntityDraft;
    }
  }

  return paperEntityDraft;
}
