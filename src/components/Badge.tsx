import { View, Text } from "react-native";

/**
 * Badge — mirrors the Figma component "Badge"
 *
 * Figma props → React Native props (1:1 mapping):
 *   variant: "default" | "success" | "warning" | "error"
 *   label: string
 */

const variantClasses = {
  default: "bg-gray-100",
  success: "bg-green-100",
  warning: "bg-yellow-100",
  error: "bg-red-100",
} as const;

const textClasses = {
  default: "text-gray-700",
  success: "text-green-700",
  warning: "text-yellow-700",
  error: "text-red-700",
} as const;

type BadgeProps = {
  variant?: keyof typeof variantClasses;
  label: string;
};

export function Badge({ variant = "default", label }: BadgeProps) {
  return (
    <View className={`px-2.5 py-0.5 rounded-full self-start ${variantClasses[variant]}`}>
      <Text className={`text-xs font-medium ${textClasses[variant]}`}>{label}</Text>
    </View>
  );
}
