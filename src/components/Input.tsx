import { View, Text, TextInput } from "react-native";

/**
 * Input — mirrors the Figma component "Input"
 *
 * Figma props → React Native props (1:1 mapping):
 *   label: string (optional)
 *   placeholder: string
 *   error: string (optional, shows error state)
 *   disabled: boolean
 */

type InputProps = {
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  value?: string;
  onChangeText?: (text: string) => void;
  secureTextEntry?: boolean;
};

export function Input({
  label,
  placeholder,
  error,
  disabled = false,
  value,
  onChangeText,
  secureTextEntry,
}: InputProps) {
  return (
    <View className="gap-1.5">
      {label && (
        <Text className="text-sm font-medium text-gray-700">{label}</Text>
      )}
      <TextInput
        className={`border rounded-lg px-3 py-2.5 text-base text-gray-900 ${
          error ? "border-red-500" : "border-gray-300"
        } ${disabled ? "bg-gray-100 opacity-50" : "bg-white"}`}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        editable={!disabled}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
      />
      {error && <Text className="text-sm text-red-500">{error}</Text>}
    </View>
  );
}
