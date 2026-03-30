import { View, Text, Image } from "react-native";

/**
 * Avatar — mirrors the Figma component "Avatar"
 *
 * Figma props → React Native props (1:1 mapping):
 *   size: "sm" | "md" | "lg"
 *   src: image URL (optional, shows initials fallback)
 *   initials: string (fallback when no image)
 */

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-14 h-14",
} as const;

const textSizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-lg",
} as const;

type AvatarProps = {
  size?: keyof typeof sizeClasses;
  src?: string;
  initials?: string;
};

export function Avatar({ size = "md", src, initials = "?" }: AvatarProps) {
  return (
    <View
      className={`rounded-full bg-blue-100 items-center justify-center overflow-hidden ${sizeClasses[size]}`}
    >
      {src ? (
        <Image source={{ uri: src }} className="w-full h-full" />
      ) : (
        <Text className={`font-semibold text-blue-600 ${textSizeClasses[size]}`}>
          {initials}
        </Text>
      )}
    </View>
  );
}
