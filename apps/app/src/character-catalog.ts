import catalog from "../characters/catalog.json";

type MiladyCharacterAssetCatalogEntry = {
  id: number;
  slug: string;
  title: string;
  sourceName: string;
};

type MiladyInjectedCharacterCatalogEntry = {
  catchphrase: string;
  name: string;
  avatarAssetId: number;
  voicePresetId?: string;
};

type MiladyCharacterCatalog = {
  assets: MiladyCharacterAssetCatalogEntry[];
  injectedCharacters: MiladyInjectedCharacterCatalogEntry[];
};

export type MiladyCharacterAsset = MiladyCharacterAssetCatalogEntry & {
  compressedVrmPath: string;
  rawVrmPath: string;
  previewPath: string;
  backgroundPath: string;
  sourceVrmFilename: string;
};

export type MiladyInjectedCharacter = MiladyInjectedCharacterCatalogEntry & {
  avatarAsset: MiladyCharacterAsset;
};

const parsedCatalog = catalog as MiladyCharacterCatalog;

export const MILADY_CHARACTER_ASSETS: MiladyCharacterAsset[] =
  parsedCatalog.assets.map((asset) => ({
    ...asset,
    compressedVrmPath: `/vrms/${asset.slug}.vrm.gz`,
    rawVrmPath: `/vrms/${asset.slug}.vrm`,
    previewPath: `/vrms/previews/${asset.slug}.png`,
    backgroundPath: `/vrms/backgrounds/${asset.slug}.png`,
    sourceVrmFilename: `${asset.sourceName}.vrm`,
  }));

export const MILADY_CHARACTER_ASSET_COUNT = MILADY_CHARACTER_ASSETS.length;

export const DEFAULT_MILADY_CHARACTER_ASSET =
  MILADY_CHARACTER_ASSETS[0] ?? null;

const miladyCharacterAssetById = new Map(
  MILADY_CHARACTER_ASSETS.map((asset) => [asset.id, asset]),
);

export function getMiladyCharacterAsset(
  id: number,
): MiladyCharacterAsset | null {
  return miladyCharacterAssetById.get(id) ?? DEFAULT_MILADY_CHARACTER_ASSET;
}

export const MILADY_INJECTED_CHARACTERS: MiladyInjectedCharacter[] =
  parsedCatalog.injectedCharacters.map((character) => {
    const avatarAsset = getMiladyCharacterAsset(character.avatarAssetId);
    if (!avatarAsset) {
      throw new Error(
        `Missing Milady avatar asset ${character.avatarAssetId} for ${character.name}.`,
      );
    }

    return {
      ...character,
      avatarAsset,
    };
  });

export const MILADY_INJECTED_CHARACTER_COUNT =
  MILADY_INJECTED_CHARACTERS.length;

const miladyInjectedCharacterByCatchphrase = new Map(
  MILADY_INJECTED_CHARACTERS.map((character) => [
    character.catchphrase,
    character,
  ]),
);

export function getMiladyInjectedCharacter(
  catchphrase: string,
): MiladyInjectedCharacter | null {
  return miladyInjectedCharacterByCatchphrase.get(catchphrase) ?? null;
}
