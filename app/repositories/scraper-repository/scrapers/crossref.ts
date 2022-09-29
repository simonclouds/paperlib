import { Response } from "got";
import stringSimilarity from "string-similarity";

import { PaperEntity } from "@/models/paper-entity";
import { Preference } from "@/preference/preference";
import { MainRendererStateStore } from "@/state/renderer/appstate";
import { formatString } from "@/utils/string";

import { Scraper, ScraperRequestType, ScraperType } from "./scraper";

export class CrossRefScraper extends Scraper {
  constructor(stateStore: MainRendererStateStore, preference: Preference) {
    super(stateStore, preference);
  }

  preProcess(paperEntityDraft: PaperEntity): ScraperRequestType {
    const enable =
      this.getEnable("crossref") &&
      (paperEntityDraft.title !== "" || paperEntityDraft.doi !== "") &&
      this.isPreprint(paperEntityDraft);

    let scrapeURL
    if (paperEntityDraft.doi !== "") {
      scrapeURL = `https://api.crossref.org/works/${encodeURIComponent(paperEntityDraft.doi)}`;
    } else {
      scrapeURL = encodeURI(
        `https://api.crossref.org/works?query.bibliographic=${formatString({
          str: paperEntityDraft.title,
          whiteSymbol: true,
        })}&rows=2&mailto=hi@paperlib.app`
      );
    }

    const headers = {};
    if (enable) {
      this.stateStore.logState.processLog = `Scraping metadata from crossref.org ...`;
    }

    return { scrapeURL, headers, enable };
  }

  parsingProcess(
    rawResponse: Response<string>,
    paperEntityDraft: PaperEntity,
    fromDOI = false
  ): PaperEntity {
    let parsedResponse;

    if (fromDOI) {
      parsedResponse = JSON.parse(rawResponse.body) as {
        message: HitItem
      };
    } else {
      parsedResponse = JSON.parse(rawResponse.body) as {
        message: {
          items: HitItem[];
        };
      };
    }

    let hitItem;

    if (fromDOI) {
      hitItem = parsedResponse.message as HitItem;
    } else {
      const hitItems = parsedResponse.message as { items: HitItem[] };
      for (const item of hitItems.items) {
        const plainHitTitle = formatString({
          str: item.title[0],
          removeStr: "&amp",
          removeSymbol: true,
          lowercased: true,
        });

        const existTitle = formatString({
          str: paperEntityDraft.title,
          removeStr: "&amp",
          removeSymbol: true,
          lowercased: true,
        });

        const sim = stringSimilarity.compareTwoStrings(plainHitTitle, existTitle);
        if (sim > 0.95) {
          hitItem = item;
          break;
        }
      }
    }

    if (hitItem) {
      paperEntityDraft.setValue("title", hitItem.title[0], false);
      paperEntityDraft.setValue("doi", hitItem.DOI, false);
      paperEntityDraft.setValue("publisher", hitItem.publisher, false);

      if (hitItem.type?.includes("journal")) {
        paperEntityDraft.setValue("type", 0, false);
      } else if (hitItem.type?.includes("book") || hitItem.type?.includes("monograph")) {
        paperEntityDraft.setValue("type", 3, false);
      } else if (hitItem.type?.includes("proceedings")) {
        paperEntityDraft.setValue("type", 1, false);
      } else {
        paperEntityDraft.setValue("type", 2, false);
      }

      paperEntityDraft.setValue("pages", hitItem.page, false);

      let publication
      if (hitItem.type?.includes('monograph')) {
        publication = hitItem.publisher;
      } else {
        publication = hitItem["container-title"]?.join(', ');
      }

      paperEntityDraft.setValue(
        "publication",
        publication,
        false
      );
      paperEntityDraft.setValue(
        "pubTime",
        `${hitItem.published?.["date-parts"]?.[0]?.[0]}`,
        false
      );
      paperEntityDraft.setValue(
        "authors",
        hitItem.author
          ?.map((author) => `${author.given} ${author.family}`)
          .join(", "),
        false
      );
      paperEntityDraft.setValue("number", hitItem.issue, false);
      paperEntityDraft.setValue("volume", hitItem.volume, false);

      this.uploadCache(paperEntityDraft, "crossref");

    }

    return paperEntityDraft;
  }

  // @ts-ignore
  scrapeImpl = scrapeImpl;
}

async function scrapeImpl(
  this: CrossRefScraper,
  entityDraft: PaperEntity,
  force = false
): Promise<PaperEntity> {
  const { scrapeURL, headers, enable } = this.preProcess(
    entityDraft
  ) as ScraperRequestType;

  if (enable || force) {
    const response = (await window.networkTool.get(
      scrapeURL,
      headers,
      1,
      false,
      10000
    )) as Response<string>;
    return this.parsingProcess(response, entityDraft, !scrapeURL.includes('bibliographic')) as PaperEntity;
  } else {
    return entityDraft;
  }
}


interface HitItem {
  title: string[];
  DOI?: string;
  publisher?: string;
  type?: string;
  page?: string;
  author?: { given: string; family: string }[];
  "container-title"?: string[];
  published?: { "date-parts": number[][] };
  issue: string;
  volume: string;
}