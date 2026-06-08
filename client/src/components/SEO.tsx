import { useEffect } from "react";

interface SEOProps {
  title: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  canonicalUrl?: string;
}

export function SEO({
  title,
  description,
  keywords,
  ogTitle,
  ogDescription,
  ogImage,
  ogType = "website",
  canonicalUrl
}: SEOProps) {
  useEffect(() => {
    // 1. Update Title (with SnapVault branding suffix if not already present)
    const formattedTitle = title.includes("SnapVault") ? title : `${title} | SnapVault`;
    document.title = formattedTitle;

    // Helper function to update or create meta tags
    const updateOrCreateMeta = (nameOrProperty: string, content: string, isProperty = false) => {
      if (!content) return;
      const attribute = isProperty ? "property" : "name";
      let element = document.querySelector(`meta[${attribute}="${nameOrProperty}"]`);
      if (element) {
        element.setAttribute("content", content);
      } else {
        element = document.createElement("meta");
        element.setAttribute(attribute, nameOrProperty);
        element.setAttribute("content", content);
        document.head.appendChild(element);
      }
    };

    // Helper function to update or create canonical links
    const updateOrCreateCanonicalLink = (href: string) => {
      if (!href) return;
      let element = document.querySelector(`link[rel="canonical"]`);
      if (element) {
        element.setAttribute("href", href);
      } else {
        element = document.createElement("link");
        element.setAttribute("rel", "canonical");
        element.setAttribute("href", href);
        document.head.appendChild(element);
      }
    };

    // 2. Update standard Description tag
    if (description) {
      updateOrCreateMeta("description", description);
      updateOrCreateMeta("og:description", ogDescription || description, true);
      updateOrCreateMeta("twitter:description", ogDescription || description);
    }

    // 3. Update standard Keywords tag
    if (keywords) {
      updateOrCreateMeta("keywords", keywords);
    }

    // 4. Update OpenGraph and Twitter Title tags
    updateOrCreateMeta("og:title", ogTitle || title, true);
    updateOrCreateMeta("twitter:title", ogTitle || title);

    // 5. Update OpenGraph type
    if (ogType) {
      updateOrCreateMeta("og:type", ogType, true);
    }

    // 6. Update OpenGraph and Twitter images
    if (ogImage) {
      updateOrCreateMeta("og:image", ogImage, true);
      updateOrCreateMeta("twitter:image", ogImage);
    }

    // 7. Update Canonical links dynamically
    const finalCanonical = canonicalUrl || window.location.href;
    updateOrCreateCanonicalLink(finalCanonical);

  }, [title, description, keywords, ogTitle, ogDescription, ogImage, ogType, canonicalUrl]);

  return null;
}
