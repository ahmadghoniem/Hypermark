import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { InlineMarkdown } from "./InlineMarkdown";

const links = (text: string) =>
  [...renderToStaticMarkup(<InlineMarkdown text={text} />).matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);

describe("InlineMarkdown bare URLs", () => {
  test("keep the #fragment, @, ~ and _ in the link", () => {
    expect(links("at http://localhost:3000/canvas.html#side-chat. Next")).toEqual(["http://localhost:3000/canvas.html#side-chat"]);
    expect(links("see https://x.com/@user/~a_b_c here")).toEqual(["https://x.com/@user/~a_b_c"]);
  });

  test("render the text after the URL once", () => {
    const html = renderToStaticMarkup(<InlineMarkdown text="at http://x.com/a#frag while up" />);
    expect(html.replace(/<[^>]+>/g, "")).toBe("at http://x.com/a#frag while up");
  });

  test("leave closing emphasis outside the link", () => {
    expect(links("*see https://x.com/a*")).toEqual(["https://x.com/a"]);
  });
});
