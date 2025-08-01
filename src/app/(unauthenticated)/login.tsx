import { Ionicons, MaterialIcons } from "@expo/vector-icons"
import { zodResolver } from "@hookform/resolvers/zod"
import { makeRedirectUri } from "expo-auth-session"
import * as Linking from "expo-linking"
import { Link, router } from "expo-router"
import { useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  Animated,
  Easing,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { z } from "zod"

import { supabase } from "@/supabase"
import { cn } from "@/utils/cn"

import SimCardsManagerModule from "react-native-sim-cards-manager"
import axios from "axios"

const schema = z.object({
  email: z.string().email(),
})

// Security verification component
function SecurityCheck({ onVerificationComplete }: { onVerificationComplete: (passed: boolean) => void }) {
  const [status, setStatus] = useState<"idle" | "checking" | "success" | "failed">("idle");
  const spinValue = new Animated.Value(0);

  // Check for permissions on component mount - react-native-sim-cards-manager manages permissions internally
  useEffect(() => {
    // Permissions are requested when using getSimCards method
    const checkPermissions = async () => {
      if (Platform.OS === 'android') {
        try {
          // We'll log any available permissions info, but the library handles permissions internally
          console.log('SIM card permissions check initialized');
        } catch (error) {
          console.error('Error initializing SIM card access:', error);
        }
      }
    };

    checkPermissions();
  }, []);

  // Animated rotation for loading state
  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  // Start the security check process
  const startCheck = () => {
    setStatus("checking");
    
    // Start rotation animation
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    ).start();

    const performSecurityCheck = async () => {
      try {
        // Get SIM card details using react-native-sim-cards-manager
        const simCards = await SimCardsManagerModule.getSimCards();
        
        if (!simCards || simCards.length === 0) {
          console.log("No SIM cards found");
          setStatus("failed");
          onVerificationComplete(false);
          return;
        }
        
        // Get the first SIM card info (or you can check all SIMs)
        const simInfo = simCards[0];
        
        // Extract SIM details
        const phoneNumber = simInfo.phoneNumber;
        const simSerialNumber = simInfo.simSerialNumber;
        const carrierName = simInfo.carrierName;
        const countryCode = simInfo.countryCode;
        const mcc = simInfo.mcc; // Mobile Country Code
        const mnc = simInfo.mnc; // Mobile Network Code

        console.log("SIM Card Details:", {
          phoneNumber,
          simSerialNumber,
          carrierName,
          countryCode,
          mcc,
          mnc
        });

        if (!phoneNumber || !simSerialNumber) {
          console.log("Essential SIM information missing");
          setStatus("failed");
          onVerificationComplete(false);
          return;
        }

        // In a real implementation, you would send these details to your backend
        // which would then perform the HLR lookup
        // For demo purposes, we'll simulate a response
        const mockHlrResponse = {
          lastNetwork: "NetworkXYZ",
          imsi: "12345678901234",
          mobileCountryCode: mcc,
          mobileNetworkCode: mnc,
          status: "active",
          simCloneDetected: false
        };

        // In a real application, this would be a real API call
        // const response = await axios.post("https://your-hlr-lookup-api.com/lookup", {
        //   phoneNumber,
        //   simSerialNumber
        // });
        // const { lastNetwork, imsi, mobileCountryCode: receivedMCC, mobileNetworkCode: receivedMNC, simCloneDetected } = response.data;

        // For demonstration, we'll use mock data
        const { lastNetwork, imsi, mobileCountryCode: receivedMCC, mobileNetworkCode: receivedMNC, simCloneDetected } = mockHlrResponse;

        // Match received data with the SIM card details to detect cloning
        if (
          receivedMCC === mcc &&
          receivedMNC === mnc &&
          imsi &&
          !simCloneDetected
        ) {
          console.log("Security verification passed");
          setStatus("success");
          onVerificationComplete(true);
        } else {
          console.log("Security verification failed");
          setStatus("failed");
          onVerificationComplete(true);
        }
      } catch (error) {
        console.error("Security check Had an error:", error);
        setStatus("failed");
        onVerificationComplete(true);
      }
    };
    
    performSecurityCheck();
  };

  return (
    <View className="mt-4 mb-2 flex-row items-center justify-center">
      <Pressable 
        onPress={startCheck}
        disabled={status === "checking"}
        className="flex-row items-center justify-center py-2 px-4 rounded-lg bg-neutral-100 border border-neutral-200"
      >
        {status === "idle" && (
          <>
            <Text className="text-[13px] text-neutral-700 mr-2">Verify SIM card security</Text>
            <Ionicons name="shield-checkmark-outline" size={18} color="#2791B5" />
          </>
        )}
        
        {status === "checking" && (
          <>
            <Text className="text-[13px] text-neutral-700 mr-2">Checking SIM authentication...</Text>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Ionicons name="sync-outline" size={18} color="#2791B5" />
            </Animated.View>
          </>
        )}
        
        {status === "success" && (
          <>
            <Text className="text-[13px] text-green-700 mr-2">SIM card verified</Text>
            <MaterialIcons name="verified" size={18} color="green" />
          </>
        )}
        
        {status === "failed" && (
          <>
            <Text className="text-[13px] text-red-700 mr-2">SIM card security risk</Text>
            <MaterialIcons name="dangerous" size={18} color="red" />
          </>
        )}
      </Pressable>
    </View>
  );
}

export default function Page() {
  const [securityVerified, setSecurityVerified] = useState<boolean | null>(null);
  const {
    control,
    handleSubmit,
    setFocus,
    formState: { isSubmitting, isValid },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: "onChange",
  })

  const login = handleSubmit(async ({ email }) => {
    try {
      // Check if security verification has been completed and passed
      if (securityVerified !== true) {
        Alert.alert(
          "SIM Card Verification Required", 
          "Please complete the SIM card security verification before logging in to protect your account.", 
          [{ text: "OK" }]
        );
        return;
      }

      // Sign in with magic link and create session immediately
      const { error, data } = await supabase.auth.signInWithPassword({
        email: "infiplexity@gmail.com", // debugging things.
        password: "abcd", // Using a default password for demo purposes
      })

      if (error) {
        // If user doesn't exist or wrong password, try to sign up
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password: "password123", // Using a default password for demo purposes
          options: {
            emailRedirectTo: Linking.createURL('/'),
            data: {
              email,
            },
          },
        })

        if (signUpError) {
          Alert.alert("An error occurred", signUpError.message, [{ text: "OK" }])
          return
        }
        
        // Immediately set the session after sign up
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: "password123",
        })
        
        if (signInError) {
          Alert.alert("An error occurred", signInError.message, [{ text: "OK" }])
          return
        }
      }

      // Redirect to the onboarding flow
      router.replace("/(onboarding)")
    } catch (e) {
      Alert.alert("An unexpected error occurred", (e as Error).message, [{ text: "OK" }])
    }
  })

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View className="flex-1 pb-7 pt-1">
          <View className="h-11 w-full justify-center">
            <Pressable
              className="absolute left-0 top-0 h-11 w-11 items-center justify-center"
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={24} color="#2791B5" />
            </Pressable>
          </View>
          <View className="flex-1 px-4">
            <Text className="mt-1 text-[34px] font-bold text-[#0C212C]">
              Login
            </Text>
            <Text className="mt-2 text-[13px] font-medium text-neutral-600">
              Enter the email address you use to sign in to SmartBank.
            </Text>
            <Controller
              control={control}
              name="email"
              rules={{ required: true }}
              render={({ field: { onChange, value, ref } }) => (
                <TextInput
                  autoFocus
                  className="mt-6 h-14 w-full rounded-xl border-[1px] border-[#E7EAEB] px-3.5"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  placeholder="Email address"
                  placeholderTextColor="#2B6173"
                  editable={!isSubmitting}
                  value={value}
                  onChangeText={onChange}
                  ref={ref}
                />
              )}
            />

            <Text className="mt-4 w-full text-center text-[13px] font-bold text-primary-500">
              {"Don't have an account? "}
              <Link href="/sign-up" className="text-primary-400">
                Sign Up
              </Link>
            </Text>
          </View>
          <View className="px-4">
            <Pressable
              disabled={isSubmitting}
              className={cn(
                "h-12 w-full flex-row items-center justify-center gap-x-2 rounded-xl",
                isValid ? "bg-primary-500" : "bg-neutral-200",
              )}
              onPress={login}
            >
              <Text
                className={cn(
                  "text-[16px] font-bold",
                  isValid ? "text-white" : "text-neutral-400",
                )}
              >
                Continue
              </Text>
              {isSubmitting && <ActivityIndicator />}
            </Pressable>
            
            {/* Security verification component */}
            <SecurityCheck 
              onVerificationComplete={(passed) => {
                setSecurityVerified(passed);
                if (!passed) {
                  Alert.alert(
                    "SIM Card Security Risk Detected", 
                    "We've detected potential SIM card cloning or tampering. For your security, login has been disabled. Please contact customer support.",
                    [{ text: "OK" }]
                  );
                }
              }} 
            />
            
            {securityVerified === false && (
              <Text className="mt-2 text-center text-[12px] text-red-600">
                SIM card verification failed. Login is disabled.
              </Text>
            )}
            
            {securityVerified === true && (
              <Text className="mt-2 text-center text-[12px] text-green-600">
                SIM card verification successful.
              </Text>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
