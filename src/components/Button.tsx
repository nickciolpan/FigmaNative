import { Pressable, Text } from "react-native";

/**
 * Button — mirrors the Figma component "Button"
 *
 * Figma props → React Native props (1:1 mapping):
 *   variant: "primary" | "secondary" | "ghost"
 *   size: "sm" | "md" | "lg"
 *   label: string
 *   disabled: boolean
 */

const variantClasses = {
  primary: "bg-blue-600 active:bg-blue-700",
  secondary: "bg-gray-200 active:bg-gray-300",
  ghost: "bg-transparent active:bg-gray-100",
} as const;

const sizeClasses = {
  sm: "px-3 py-1.5",
  md: "px-4 py-2.5",
  lg: "px-6 py-3.5",
} as const;

const textVariantClasses = {
  primary: "text-white",
  secondary: "text-gray-900",
  ghost: "text-blue-600",
} as const;

const textSizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
} as const;

type ButtonProps = {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
  label: string;
  disabled?: boolean;
  onPress?: () => void;
};

export function Button({
  variant = "primary",
  size = "md",
  label,
  disabled = false,
  onPress,
}: ButtonProps) {
  return (
    <Pressable
      className={`rounded-lg items-center justify-center ${variantClasses[variant]} ${sizeClasses[size]} ${disabled ? "opacity-50" : ""}`}
      disabled={disabled}
      onPress={onPress}
    >
      <Text
        className={`font-semibold ${textVariantClasses[variant]} ${textSizeClasses[size]}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
