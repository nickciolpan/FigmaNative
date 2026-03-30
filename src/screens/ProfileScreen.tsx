/**
 * ProfileScreen
 *
 * Another Figma → Code example. The designer built this with:
 * Avatar, Card, Badge, Button, Divider components.
 *
 * A developer opens Figma Dev Mode, sees the component names + props,
 * and writes this code — no guesswork, no recoding.
 */

import { View, Text } from "react-native";
import { Avatar, Badge, Button, Card, Divider } from "../components";

export function ProfileScreen() {
  return (
    <View className="flex-1 bg-gray-50 p-6">
      <View className="gap-4">
        {/* Header with avatar — mirrors Figma auto-layout (horizontal, gap=12) */}
        <View className="flex-row items-center gap-3">
          <Avatar size="lg" initials="NC" />
          <View className="flex-1">
            <Text className="text-xl font-semibold text-gray-900">
              Nick Ciolpan
            </Text>
            <Text className="text-sm text-gray-500">nick@example.com</Text>
          </View>
          <Badge variant="success" label="Pro" />
        </View>

        <Divider />

        {/* Stats card */}
        <Card title="Activity" subtitle="This week">
          <View className="flex-row justify-between">
            <View className="items-center">
              <Text className="text-2xl font-bold text-gray-900">12</Text>
              <Text className="text-xs text-gray-500">Projects</Text>
            </View>
            <View className="items-center">
              <Text className="text-2xl font-bold text-gray-900">48</Text>
              <Text className="text-xs text-gray-500">Screens</Text>
            </View>
            <View className="items-center">
              <Text className="text-2xl font-bold text-gray-900">156</Text>
              <Text className="text-xs text-gray-500">Components</Text>
            </View>
          </View>
        </Card>

        {/* Actions */}
        <Card padding="sm">
          <View className="gap-2">
            <Button label="Edit Profile" variant="secondary" />
            <Button label="Sign Out" variant="ghost" />
          </View>
        </Card>
      </View>
    </View>
  );
}
