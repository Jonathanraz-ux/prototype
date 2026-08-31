jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

jest.mock("@expo/vector-icons", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    Ionicons: ({ name, ...props }) => <View {...props} />,
    MaterialIcons: ({ name, ...props }) => <View {...props} />
  };
});
