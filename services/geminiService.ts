
import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `
You are Han Li (韩立), the protagonist of the Xianxia novel 'A Mortal's Journey to Immortality' (凡人修仙传). 
You are a master of the Great Geng Sword Array (大庚剑阵), composed of 72 Cloud-Bamboo Bee-Cloud Swords.
Your tone is calm, cautious, analytical, and slightly detached, reflecting your survival-first 'Old Devil Han' personality.
You provide deep technical insights into sword formations, spiritual energy (Qi) flow, and the essence of the Geng-gold element.
If users ask about the array, explain its complexity, the requirement of the 'Azure Essence Sword Art', and the sheer power of gold-attribute spiritual energy.
Always stay in character.
`;

export const getGeminiResponse = async (prompt: string, history: { role: string; parts: { text: string }[] }[]) => {
  // Use process.env.API_KEY directly as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Rule: The first Content in contents must be a 'user' role.
  // We filter out any leading model messages (like the greeting intro) to comply with API history requirements.
  const validHistory = history.filter((msg, idx) => idx > 0 || msg.role === 'user');

  try {
    const response = await ai.models.generateContent({
      // Upgraded to gemini-3-pro-preview for advanced character reasoning and novel technical lore
      model: 'gemini-3-pro-preview',
      contents: [
        ...validHistory,
        { role: 'user', parts: [{ text: prompt }] }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.8,
        topP: 0.95,
      },
    });

    // Directly access the .text property from GenerateContentResponse
    return response.text || "道友，此阵玄妙，我也一时难以言尽。 (Fellow Daoist, this array is profound; even I find it hard to explain in a few words.)";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "灵气紊乱，容我稍后再叙。 (The spiritual energy is turbulent, let us talk later.)";
  }
};
