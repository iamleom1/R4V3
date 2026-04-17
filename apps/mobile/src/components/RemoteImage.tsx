import React, { useEffect, useState } from "react";
import type { StyleProp, ImageStyle } from "react-native";
import { Image as ExpoImage } from "expo-image";

type Props = {
  uri?: string | null;
  style: StyleProp<ImageStyle>;
  fallback?: React.ReactNode;
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  transition?: number;
};

export function RemoteImage({ uri, style, fallback = null, contentFit = "cover", transition = 140 }: Props) {
  const normalizedUri = typeof uri === "string" && uri.trim() ? uri.trim() : null;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [normalizedUri]);

  if (!normalizedUri || imageFailed) {
    return <>{fallback}</>;
  }

  return (
    <ExpoImage
      source={normalizedUri}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={transition}
      onError={() => setImageFailed(true)}
    />
  );
}

export function prefetchRemoteImages(uris: Array<string | null | undefined>) {
  const uniqueUris = Array.from(
    new Set(
      uris
        .map((uri) => (typeof uri === "string" ? uri.trim() : ""))
        .filter(Boolean)
    )
  );

  if (uniqueUris.length === 0) {
    return;
  }

  void ExpoImage.prefetch(uniqueUris, "memory-disk").catch(() => undefined);
}
