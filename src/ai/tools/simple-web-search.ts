/**
 * Simple Web Search Tool for Molly
 *
 * Uses DuckDuckGo Instant Answer API (no key required, privacy-friendly)
 * Returns top web results for a given query.
 */

import fetch from 'node-fetch';

export async function simpleWebSearch(query: string): Promise<{ title: string; url: string; snippet?: string }[]> {
  const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`DuckDuckGo API error: ${res.status}`);
  const data = await res.json();

  // Parse results from RelatedTopics and Abstract
  const results: { title: string; url: string; snippet?: string }[] = [];

  if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
    for (const topic of data.RelatedTopics) {
      if (topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text.split(' - ')[0],
          url: topic.FirstURL,
          snippet: topic.Text,
        });
      } else if (topic.Topics && Array.isArray(topic.Topics)) {
        for (const sub of topic.Topics) {
          if (sub.Text && sub.FirstURL) {
            results.push({
              title: sub.Text.split(' - ')[0],
              url: sub.FirstURL,
              snippet: sub.Text,
            });
          }
        }
      }
    }
  }

  if (data.AbstractText && data.AbstractURL) {
    results.unshift({
      title: data.Heading || query,
      url: data.AbstractURL,
      snippet: data.AbstractText,
    });
  }

  return results.slice(0, 5); // Return top 5 results
}
