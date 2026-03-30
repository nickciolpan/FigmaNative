import { View } from "react-native";

/**
 * Divider — mirrors the Figma component "Divider"
 *
 * Figma props → React Native props (1:1 mapping):
 *   spacing: "sm" | "md" | "lg"
 */

const spacingClasses = {
  sm: "my-2",
  md: "my-4",
  lg: "my-6",
} as const;

type DividerProps = {
  spacing?: keyof typeof spacingClasses;
};

export function Divider({ spacing = "md" }: DividerProps) {
  return <View className={`h-px bg-gray-200 ${spacingClasses[spacing]}`} />;
}
