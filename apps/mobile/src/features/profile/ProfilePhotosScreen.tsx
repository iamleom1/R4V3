import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "../../app/AppProvider";
import { RemoteImage } from "../../components/RemoteImage";
import { theme } from "../../theme";
import {
  deleteProfilePhoto,
  listProfilePhotos,
  type ProfilePhoto,
  uploadProfilePhotoToSlot
} from "./photoRepository";
import type { ProfileStackParamList } from "./ProfileNavigator";

type Props = NativeStackScreenProps<ProfileStackParamList, "ProfilePhotos">;

export function ProfilePhotosScreen(_: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAppState();
  const [photoSlots, setPhotoSlots] = useState<Array<ProfilePhoto | null>>([null, null, null, null, null, null]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingSlot, setIsUploadingSlot] = useState<number | null>(null);
  const [localPreviewUris, setLocalPreviewUris] = useState<Record<number, string>>({});

  const photoCount = useMemo(() => photoSlots.filter(Boolean).length, [photoSlots]);

  useEffect(() => {
    void refreshPhotos();
  }, [session?.user?.id]);

  useFocusEffect(
    React.useCallback(() => {
      void refreshPhotos();
      return undefined;
    }, [session?.user?.id])
  );

  async function refreshPhotos() {
    if (!session?.user?.id) {
      setPhotoSlots([null, null, null, null, null, null]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const rows = await listProfilePhotos(session.user.id);
    const next: Array<ProfilePhoto | null> = [null, null, null, null, null, null];
    for (const photo of rows) {
      if (photo.sortOrder >= 0 && photo.sortOrder < next.length) next[photo.sortOrder] = photo;
    }
    setPhotoSlots(next);
    setIsLoading(false);
  }

  async function handlePick(slot: number) {
    if (!session?.user?.id) {
      Alert.alert("Sign in required", "Sign in with Supabase to upload profile photos.");
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Enable photo library access to upload profile photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 5],
      base64: true,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Compatible
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const normalized = await normalizePickedImage(asset);
    setLocalPreviewUris((prev) => ({ ...prev, [slot]: normalized.uri }));
    setIsUploadingSlot(slot);
    const upload = await uploadProfilePhotoToSlot({
      profileId: session.user.id,
      fileUri: normalized.uri,
      sortOrder: slot,
      contentType: "image/jpeg",
      fileName: (asset.fileName?.replace(/\.[^.]+$/, "") || `photo-${Date.now()}`) + ".jpg"
    });
    setIsUploadingSlot(null);
    if (!upload.ok) {
      setLocalPreviewUris((prev) => {
        const next = { ...prev };
        delete next[slot];
        return next;
      });
      Alert.alert("Upload failed", upload.error);
      return;
    }
    setPhotoSlots((prev) => prev.map((value, index) => (index === slot ? upload.photo : value)));
    setLocalPreviewUris((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
    void refreshPhotos();
  }

  async function handleDelete(slot: number) {
    const photo = photoSlots[slot];
    if (!photo || !session?.user?.id) return;
    const res = await deleteProfilePhoto({ profileId: session.user.id, photoId: photo.id, storagePath: photo.storagePath });
    if (!res.ok) {
      Alert.alert("Delete failed", res.error);
      return;
    }
    setPhotoSlots((prev) => prev.map((p, i) => (i === slot ? null : p)));
    setLocalPreviewUris((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Photo Editor</Text>
        <Text style={styles.title}>Add and arrange your profile photos</Text>
        <Text style={styles.copy}>Tap a slot to add/replace. Use arrows to reorder. Slot 1 is your cover photo.</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{photoCount}/6 photos</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading photos...</Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        {photoSlots.map((photo, index) => (
          <View key={`photo-editor-${index}`} style={[styles.tile, index === 0 && styles.tilePrimary]}>
            <Pressable style={[styles.tilePress, photo && styles.tileFilled]} onPress={() => void handlePick(index)}>
              {(() => {
                const localPreview = localPreviewUris[index];
                const imageUri = localPreview || photo?.url || "";
                return imageUri ? (
                  <RemoteImage
                    uri={imageUri}
                    style={styles.photoImage}
                    transition={0}
                  />
                ) : null;
              })()}
              <View style={styles.tileOverlay} />
              {photo ? (
                <Pressable style={styles.deleteButton} onPress={() => void handleDelete(index)} hitSlop={8}>
                  <Text style={styles.deleteButtonText}>×</Text>
                </Pressable>
              ) : null}
              <Text style={styles.slotLabel}>{index === 0 ? "Cover" : `Photo ${index + 1}`}</Text>
              <Text style={styles.slotHint}>
                {isUploadingSlot === index ? "Uploading..." : photo ? "Tap to replace" : "Tap to add"}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

async function normalizePickedImage(asset: ImagePicker.ImagePickerAsset) {
  const targetWidth = asset.width && asset.width > 1400 ? 1400 : asset.width || 1200;
  const result = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: targetWidth } }],
    {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG
    }
  );

  return {
    uri: result.uri
  };
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.canvas },
  container: { padding: 16, gap: 14 },
  hero: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 16,
    gap: 8
  },
  eyebrow: { color: theme.colors.textSecondary, ...theme.type.eyebrow },
  title: { color: theme.colors.textPrimary, ...theme.type.titleLg },
  copy: { color: theme.colors.textSecondary, ...theme.type.body },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(211,92,51,0.35)",
    backgroundColor: "rgba(211,92,51,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  badgeText: { color: "#FFF8EE", fontWeight: "700", fontSize: 12 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadingText: { color: theme.colors.textSecondary },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    alignItems: "flex-start",
    alignContent: "flex-start"
  },
  tile: {
    width: "48.5%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 8
  },
  tilePrimary: { borderColor: "rgba(211,92,51,0.35)" },
  tilePress: {
    aspectRatio: 0.82,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.02)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  tileFilled: { borderStyle: "solid", backgroundColor: "#1D1712" },
  photoImage: { ...StyleSheet.absoluteFillObject },
  tileOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)"
  },
  deleteButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: "rgba(10,9,8,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2
  },
  deleteButtonText: {
    color: "#FFF8EE",
    fontSize: 18,
    lineHeight: 18,
    fontWeight: "700"
  },
  slotLabel: { color: "#FFF8EE", fontWeight: "800", fontSize: 12, textAlign: "center" },
  slotHint: { color: "rgba(255,249,239,0.8)", fontSize: 10, marginTop: 2, textAlign: "center" },
});
