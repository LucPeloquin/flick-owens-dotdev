import type { MDXComponents } from "mdx/types";

const components: MDXComponents = {
  h2: ({ children, ...props }) => <h2 {...props}>{children}</h2>,
  p: ({ children, ...props }) => <p {...props}>{children}</p>,
  ul: ({ children, ...props }) => <ul {...props}>{children}</ul>,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
