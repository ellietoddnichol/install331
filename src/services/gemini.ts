
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface ParsedTakeoffItem {
  description: string;
  qty: number;
  uom: string;
  roomName?: string;
  scopeName?: string;
  notes?: string;
}

export const gemini = {
  async parseTakeoffDocument(fileBase64: string, mimeType: string): Promise<ParsedTakeoffItem[]> {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `You are a construction estimation expert. Analyze the attached construction document (takeoff, schedule, or drawing) and extract a list of items to be installed.
              Focus on Division 10 Specialties (Grab bars, toilet partitions, lockers, mirrors, etc.) if applicable, but extract all relevant architectural specialties.
              
              Return a JSON array of items with the following fields:
              - description: A clear description of the item.
              - qty: The numerical quantity.
              - uom: Unit of measure (EA, LF, SF, etc.).
              - roomName: The room or location name if specified.
              - scopeName: The division or scope name if specified.
              - notes: Any relevant notes or specifications.
              
              If you cannot find specific quantities, estimate based on the document or leave as 1.
              Only return the JSON array, no other text.`
            },
            {
              inlineData: {
                data: fileBase64,
                mimeType: mimeType
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              qty: { type: Type.NUMBER },
              uom: { type: Type.STRING },
              roomName: { type: Type.STRING },
              scopeName: { type: Type.STRING },
              notes: { type: Type.STRING }
            },
            required: ["description", "qty", "uom"]
          }
        }
      }
    });

    try {
      return JSON.parse(response.text || '[]');
    } catch (err) {
      console.error("Failed to parse Gemini response", err);
      return [];
    }
  }
};
