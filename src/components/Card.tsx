import { View, Text } from "react-native";
import type { ReactNode } from "react";

/**
 * Card — mirrors the Figma component "Card"
 *
 * Figma props → React Native props (1:1 mapping):
 *   title: string (optional)
 *   subtitle: string (optional)
 *   padding: "none" | "sm" | "md" | "lg"
 *   children: nested layers become children
 */

const paddingClasses = {
  none: "",
  sm: "p-2",
  md: "p-4",
  lg: "p-6",
} as const;

type CardProps = {
  title?: string;
  subtitle?: string;
  padding?: keyof typeof paddingClasses;
  children?: ReactNode;
};

export function Card({
  title,
  subtitle,
  padding = "md",
  children,
}: CardProps) {
  return (
    <View
      className={`bg-white rounded-2xl shadow-sm border border-gray-100 ${paddingClasses[padding]}`}
    >
      {title && (
        <Text className="text-lg font-semibold text-gray-900">{title}</Text>
      )}
      {subtitle && (
        <Text className="text-sm text-gray-500 mt-1">{subtitle}</Text>
      )}
      {children && <View className={title || subtitle ? "mt-3" : ""}>{children}</View>}
    </View>
  );
}
