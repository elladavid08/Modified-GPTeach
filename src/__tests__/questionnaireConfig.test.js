// Pre/post PCK questionnaires (src/config/testConfig.js). Protects:
//   - the questionnaire content: scenario ids and order, claims, question texts, and the five
//     follow-up questions (submissions and annotation map answers by scenario position and
//     question key, so these must not drift);
//   - the geometry images: exactly one image per questionnaire, the rotated square on the pre-test
//     (scenario 2, יובל) and the rotated rectangle on the post-test (scenario 2, אלון), each an
//     existing PNG in public/images with a transparent background (the educational team asked to
//     replace the earlier pale-yellow ones).
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { PRE_TEST, POST_TEST, PCK_SKILLS } from "../config/testConfig";

const PUBLIC = path.join(__dirname, "..", "..", "public");

/** Minimal PNG reader (8-bit RGBA, non-interlaced): {width, height, alpha(x, y), rgba(x, y)}. */
function readPng(file) {
	const b = fs.readFileSync(file);
	expect(b.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
	let p = 8;
	let width;
	let height;
	let depth;
	let colorType;
	const idat = [];
	while (p < b.length) {
		const len = b.readUInt32BE(p);
		const type = b.toString("ascii", p + 4, p + 8);
		const data = b.slice(p + 8, p + 8 + len);
		if (type === "IHDR") {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			depth = data[8];
			colorType = data[9];
		}
		if (type === "IDAT") idat.push(data);
		p += 12 + len;
	}
	expect([depth, colorType]).toEqual([8, 6]); // 8-bit RGBA: has an alpha channel
	const raw = zlib.inflateSync(Buffer.concat(idat));
	const stride = width * 4;
	const px = Buffer.alloc(height * stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		for (let x = 0; x < stride; x++) {
			const left = x >= 4 ? px[y * stride + x - 4] : 0;
			const up = y ? px[(y - 1) * stride + x] : 0;
			const upLeft = x >= 4 && y ? px[(y - 1) * stride + x - 4] : 0;
			let v = raw[y * (stride + 1) + 1 + x];
			if (filter === 1) v += left;
			else if (filter === 2) v += up;
			else if (filter === 3) v += (left + up) >> 1;
			else if (filter === 4) {
				const pp = left + up - upLeft;
				const pa = Math.abs(pp - left);
				const pb = Math.abs(pp - up);
				const pc = Math.abs(pp - upLeft);
				v += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
			}
			px[y * stride + x] = v & 255;
		}
	}
	const at = (x, y) => Array.from(px.slice(y * stride + x * 4, y * stride + x * 4 + 4));
	return { width, height, rgba: at, alpha: (x, y) => at(x, y)[3] };
}

describe("questionnaire content is unchanged", () => {
	it("has the five PCK skills mapped to q1..q5", () => {
		expect(PCK_SKILLS.map((s) => [s.id, s.questionKey])).toEqual([
			["p1", "q1"],
			["p2", "q2"],
			["p3", "q3"],
			["p4", "q4"],
			["p5", "q5"],
		]);
	});

	it.each([
		["pre", PRE_TEST, ["מרים", "יובל", "רועי"]],
		["post", POST_TEST, ["עדן", "אלון", "נועה"]],
	])("%s-test: three scenarios in order, claims and questions as before", (testType, config, students) => {
		expect(config.testType).toBe(testType);
		expect(config.scenarios.map((s) => s.id)).toEqual(["scenario1", "scenario2", "scenario3"]);
		config.scenarios.forEach((s, i) => {
			expect(s.questionText).toBe(`מה דעתך על הטענה של ${students[i]}?`);
			expect(s.questionsIncorrect).toHaveLength(5);
		});
		expect(config.scenarios[0].questionsIncorrect).toEqual([
			"מהי השגיאה המופיעה בטענה של התלמיד? הסבר בקצרה.",
			"איזה סוג שגיאה אתה מזהה כאן? נמק.",
			"מהו לדעתך מקור החשיבה האפשרי שהוביל את התלמיד לשגיאה זו?",
			"כיצד היית מגיב לתלמיד בכיתה לאחר שהציג טענה זו?",
			"כיצד ניתן לדעתך להשתמש בשגיאה זו כדי לקדם את הלמידה של התלמידים בכיתה?",
		]);
	});

	it("keeps the claims of the image questions", () => {
		expect(PRE_TEST.scenarios[1].claim.text).toBe("הצורה בצד איננה ריבוע כי הוא לא ישר, הוא כזה מסובב");
		expect(POST_TEST.scenarios[1].claim.text).toBe("הצורה בצד איננה מקבילית כי יש בה זוויות ישרות");
	});
});

describe("questionnaire geometry images", () => {
	it("only scenario 2 of each questionnaire has an image", () => {
		expect(PRE_TEST.scenarios.map((s) => Boolean(s.image))).toEqual([false, true, false]);
		expect(POST_TEST.scenarios.map((s) => Boolean(s.image))).toEqual([false, true, false]);
	});

	it("pre-test uses the rotated square, post-test the rotated rectangle (transparent versions)", () => {
		expect(PRE_TEST.scenarios[1].image).toBe("/images/rotated-square-transparent.png");
		expect(PRE_TEST.scenarios[1].imageAlt).toBe("ריבוע מסובב");
		expect(POST_TEST.scenarios[1].image).toBe("/images/rotated-rectangle-transparent.png");
		expect(POST_TEST.scenarios[1].imageAlt).toBe("מקבילית מסובבת");
	});

	it.each([
		["pre", PRE_TEST],
		["post", POST_TEST],
	])("%s-test image exists and has a transparent background (no pale-yellow box)", (_t, config) => {
		const img = readPng(path.join(PUBLIC, config.scenarios[1].image));
		const corners = [
			[0, 0],
			[img.width - 1, 0],
			[0, img.height - 1],
			[img.width - 1, img.height - 1],
		];
		corners.forEach(([x, y]) => expect(img.alpha(x, y)).toBe(0));
		// no opaque pale-yellow (#FFF2CC-like) background pixels anywhere
		let paleYellow = 0;
		for (let y = 0; y < img.height; y += 2) {
			for (let x = 0; x < img.width; x += 2) {
				const [r, g, b, a] = img.rgba(x, y);
				if (a > 200 && r > 240 && g > 225 && b > 180 && b < 230) paleYellow++;
			}
		}
		expect(paleYellow).toBe(0);
	});
});
