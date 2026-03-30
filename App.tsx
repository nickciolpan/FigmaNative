import "./global.css";
import { SafeAreaView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LoginScreen } from "./src/screens/LoginScreen";

export default function App() {
  return (
    <SafeAreaView className="flex-1">
      <LoginScreen />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
