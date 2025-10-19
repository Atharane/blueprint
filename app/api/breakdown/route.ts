import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GOOGLE_AI_API_KEY) {
	throw new Error("(/breakdown):MISSING_GOOGLE_AI_API_KEY");
}

const gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

export async function POST(req: Request) {
	try {
		const { idea, depth = 1, focusArea = null } = await req.json();
		if (!idea || typeof idea !== "string") {
			return Response.json({ error: "invalid input" }, { status: 400 });
		}

		const model = gemini.getGenerativeModel({ model: "gemini-2.5-flash" });

    // todo: use structured output
		const prompt = `
      Provide a comprehensive breakdown for the following project idea: "${idea}"
      
      Depth level: ${depth}
      ${focusArea ? `Focus area: ${focusArea}` : ""}

      Format your response as a valid JSON object with this structure:
      {
        "overview": "High-level overview of the project. Do not use markdown formatting or special characters.",
        "priorities": {
          "p0": {
            "frontend": {
              "components": [
                {
                  "name": "Component name",
                  "description": "Brief description without markdown or special characters",
                  "requirements": ["List of key requirements"]
                }
              ]
            },
            "backend": {
              "services": [
                {
                  "name": "Service name",
                  "description": "Brief description without markdown or special characters",
                  "requirements": ["List of key requirements"]
                }
              ],
              "dataModel": ["Key data entities and their relationships"]
            }
          },
          "p1": {
            "frontend": { "components": [] },
            "backend": { "services": [], "dataModel": [] }
          },
          "p2": {
            "frontend": { "components": [] },
            "backend": { "services": [], "dataModel": [] }
          }
        },
        "systemArchitecture": {
          "components": ["List of main system components"],
          "connections": ["List of connections between components"],
          "dataFlow": ["Description of data flow between components"]
        },
        "developmentSteps": [
          {
            "phase": "Phase name",
            "tasks": ["List of specific tasks to complete"],
            "priority": "P0/P1/P2"
          }
        ]
      }

      Rules:
      1. Focus on concrete, actionable information for building an MVP.
      2. P0 should include only the most critical components and services for a basic working prototype.
      3. P1 should include important but not critical features that enhance the basic prototype.
      4. P2 should include nice-to-have features or future enhancements.
      5. For each priority level, provide 2-4 frontend components and 1-3 backend services.
      6. The systemArchitecture should provide a clear overview of how components interact.
      7. Outline 3-4 development phases with specific tasks and priority levels.
      8. Adjust the detail level based on the depth parameter.
      9. If a focus area is provided, provide more details for that specific area.
      10. Do not use markdown formatting or special characters in any text fields.
      11. Response must be ONLY the JSON object, no other text.
    `;

		const result = await model.generateContent(prompt);
		const response = await result.response;
		const text = response.text();

		try {
			const output = text.match(/\{[\s\S]*\}/);
			if (!output) {
				throw new Error("malformed model output");
			}

			const jsonStr = output[0];
			const jsonResponse = JSON.parse(jsonStr);

			// basic validation of the response structure
			if (
				!jsonResponse.overview ||
				!jsonResponse.priorities ||
				!jsonResponse.systemArchitecture ||
				!jsonResponse.developmentSteps
			) {
				throw new Error("Invalid response structure");
			}

			// ensure all priority levels exist
			const priorities = ["p0", "p1", "p2"];
			for (const priority of priorities) {
				if (!jsonResponse.priorities[priority]) {
					jsonResponse.priorities[priority] = {
						frontend: { components: [] },
						backend: { services: [], dataModel: [] },
					};
				}
			}

			return Response.json(jsonResponse);
		} catch (parseError) {
			// parsing error indicates malformed response
			console.error("(/breakdown):parse error:", parseError);
			console.error("(/breakdown):raw response:", text);

			return Response.json(
				{ error: "failed to parse model response" },
				{ status: 422 },
			);
		}
	} catch (error) {
		// general server error
		console.error("(/breakdown):ERROR", error);
		return Response.json({ error: "internal server error" }, { status: 500 });
	}
}
