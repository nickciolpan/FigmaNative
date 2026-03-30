/**
 * LoginScreen
 *
 * This screen was "designed" in Figma. Here's how the translation works:
 *
 * FIGMA LAYER TREE:                    →  REACT NATIVE CODE:
 * ──────────────────────────────────────────────────────────
 * Frame "LoginScreen"                  →  <View>
 *   ├─ Auto Layout (vertical, gap=24)  →    className="flex-1 justify-center p-6 gap-6"
 *   ├─ Text "Welcome back"            →    <Text>
 *   ├─ Card                           →    <Card>
 *   │   ├─ Input (label="Email")      →      <Input label="Email" />
 *   │   ├─ Input (label="Password")   →      <Input label="Password" secureTextEntry />
 *   │   └─ Button (label="Sign In")   →      <Button label="Sign In" />
 *   └─ Button (variant="ghost")       →    <Button variant="ghost" label="Forgot?" />
 *
 * Notice: component names and props are IDENTICAL between Figma and code.
 */

import { View, Text } from "react-native";
import { Button, Card, Input } from "../components";

export function LoginScreen() {
  return (
    <View className="flex-1 justify-center bg-gray-50 p-6">
      <View className="gap-6">
        {/* Text layer from Figma */}
        <View className="gap-2">
          <Text className="text-3xl font-bold text-gray-900">Welcome back</Text>
          <Text className="text-base text-gray-500">Sign in to your account</Text>
        </View>

        {/* Card component from Figma — same name, same props */}
        <Card padding="lg">
          <View className="gap-4">
            <Input label="Email" placeholder="you@example.com" />
            <Input
              label="Password"
              placeholder="••••••••"
              secureTextEntry
            />
            <Button label="Sign In" variant="primary" size="lg" />
          </View>
        </Card>

        {/* Ghost button from Figma — same variant prop */}
        <Button label="Forgot your password?" variant="ghost" />
      </View>
    </View>
  );
}
