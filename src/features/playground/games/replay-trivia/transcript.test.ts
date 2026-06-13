import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTranscriptPanelParams,
  createTranscriptWindow,
  extractInitialPlayerResponse,
  extractInnertubeApiKey,
  fetchTranscriptPanelSegments,
  fetchReplayTriviaTranscriptWindow,
  getTranscriptEndSeconds,
  parseJson3Transcript,
  parseTranscriptPanelSegments,
  parseXmlTranscript,
  pickCaptionTrack
} from './transcript';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Replay Trivia transcript collection', () => {
  it('extracts YouTube player metadata from watch HTML', () => {
    const html = `
      <script>
        var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc","languageCode":"en"}]}}};
        ytcfg.set({"INNERTUBE_API_KEY":"test_key"});
      </script>
    `;

    expect(extractInitialPlayerResponse(html).captions?.playerCaptionsTracklistRenderer?.captionTracks).toHaveLength(1);
    expect(extractInnertubeApiKey(html)).toBe('test_key');
  });

  it('prefers manual tracks for requested languages before generated tracks', () => {
    const track = pickCaptionTrack([
      {
        baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&lang=en&kind=asr',
        kind: 'asr',
        languageCode: 'en'
      },
      {
        baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&lang=es',
        languageCode: 'es'
      },
      {
        baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&lang=en',
        languageCode: 'en'
      }
    ], ['en']);

    expect(track?.kind).toBeUndefined();
    expect(track?.languageCode).toBe('en');
  });

  it('parses json3 and XML transcript payloads', () => {
    expect(parseJson3Transcript({
      events: [
        {
          dDurationMs: 1200,
          segs: [{ utf8: 'Hello ' }, { utf8: 'chat' }],
          tStartMs: 5000
        },
        {
          tStartMs: 7000
        }
      ]
    })).toEqual([
      {
        durationSeconds: 1.2,
        startSeconds: 5,
        text: 'Hello chat'
      }
    ]);

    expect(parseXmlTranscript('<transcript><text start="7.5" dur="2">Hi &amp; bye</text></transcript>')).toEqual([
      {
        durationSeconds: 2,
        startSeconds: 7.5,
        text: 'Hi & bye'
      }
    ]);
  });

  it('creates the transcript panel params used by YouTube get_panel', () => {
    expect(createTranscriptPanelParams('SHt3FyE-VIQ')).toBe('qgkPCgtTSHQzRnlFLVZJURgB');
  });

  it('parses YouTube transcript panel entries', () => {
    expect(parseTranscriptPanelSegments({
      actions: [
        {
          updateEngagementPanelAction: {
            content: {
              transcriptRenderer: {
                content: {
                  transcriptSearchPanelRenderer: {
                    body: {
                      transcriptSegmentListRenderer: {
                        initialSegments: [
                          {
                            macroMarkersPanelItemViewModel: {
                              item: {
                                timelineItemViewModel: {
                                  contentItems: [
                                    {
                                      transcriptSegmentViewModel: {
                                        simpleText: 'WELCOME TO THE GAME AWARDS.',
                                        timestamp: '23:40'
                                      }
                                    }
                                  ]
                                }
                              },
                              onTap: {
                                innertubeCommand: {
                                  watchEndpoint: {
                                    startTimeSeconds: 1420
                                  }
                                }
                              }
                            }
                          },
                          {
                            macroMarkersPanelItemViewModel: {
                              item: {
                                timelineItemViewModel: {
                                  contentItems: [
                                    {
                                      transcriptSegmentViewModel: {
                                        runs: [{ text: 'Next ' }, { text: 'line' }],
                                        timestamp: '23:52'
                                      }
                                    }
                                  ]
                                }
                              },
                              onTap: {
                                innertubeCommand: {
                                  watchEndpoint: {
                                    startTimeSeconds: 1432
                                  }
                                }
                              }
                            }
                          }
                        ]
                      }
                    }
                  }
                }
              }
            }
          }
        }
      ]
    })).toEqual([
      {
        durationSeconds: 12,
        startSeconds: 1420,
        text: 'WELCOME TO THE GAME AWARDS.'
      },
      {
        durationSeconds: 3,
        startSeconds: 1432,
        text: 'Next line'
      }
    ]);
  });

  it('filters transcript segments to the requested replay window', () => {
    expect(createTranscriptWindow([
      { durationSeconds: 2, startSeconds: 8, text: 'before' },
      { durationSeconds: 3, startSeconds: 10, text: 'start' },
      { durationSeconds: 3, startSeconds: 20, text: 'end' }
    ], 10, 20)).toEqual([
      { durationSeconds: 3, startSeconds: 10, text: 'start' }
    ]);
    expect(getTranscriptEndSeconds([
      { durationSeconds: 2.5, startSeconds: 8, text: 'line' },
      { startSeconds: 20, text: 'last' }
    ])).toBe(20);
  });

  it('fetches a compact transcript window from the selected caption track', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/watch')) {
        return new Response(`
          <script>
            var ytInitialPlayerResponse = ${JSON.stringify({
              captions: {
                playerCaptionsTracklistRenderer: {
                  captionTracks: [
                    {
                      baseUrl: 'https://www.youtube.com/api/timedtext?v=SHt3FyE-VIQ&lang=en',
                      languageCode: 'en'
                    }
                  ]
                }
              }
            })};
          </script>
        `);
      }

      return new Response(JSON.stringify({
        events: [
          { dDurationMs: 1000, segs: [{ utf8: 'Opening line' }], tStartMs: 9000 },
          { dDurationMs: 1000, segs: [{ utf8: 'Trivia line' }], tStartMs: 12000 },
          { dDurationMs: 1000, segs: [{ utf8: 'Later line' }], tStartMs: 22000 }
        ]
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = await fetchReplayTriviaTranscriptWindow({
      endSeconds: 20,
      startSeconds: 10,
      videoId: 'SHt3FyE-VIQ'
    });

    expect(request).toEqual({
      endSeconds: 20,
      languageCode: 'en',
      segments: [
        {
          durationSeconds: 1,
          startSeconds: 12,
          text: 'Trivia line'
        }
      ],
      startSeconds: 10,
      videoId: 'SHt3FyE-VIQ'
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain('fmt=json3');
  });

  it('uses the whole transcript by default when no replay window is requested', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/watch')) {
        return new Response(`
          <script>
            var ytInitialPlayerResponse = ${JSON.stringify({
              captions: {
                playerCaptionsTracklistRenderer: {
                  captionTracks: [
                    {
                      baseUrl: 'https://www.youtube.com/api/timedtext?v=SHt3FyE-VIQ&lang=en',
                      languageCode: 'en'
                    }
                  ]
                }
              }
            })};
          </script>
        `);
      }

      return new Response(JSON.stringify({
        events: [
          { dDurationMs: 1000, segs: [{ utf8: 'Opening line' }], tStartMs: 9000 },
          { dDurationMs: 1000, segs: [{ utf8: 'Trivia line' }], tStartMs: 12000 },
          { dDurationMs: 2500, segs: [{ utf8: 'Final line' }], tStartMs: 22000 }
        ]
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = await fetchReplayTriviaTranscriptWindow({
      videoId: 'SHt3FyE-VIQ'
    });

    expect(request.startSeconds).toBe(0);
    expect(request.endSeconds).toBe(24.5);
    expect(request.segments.map((segment) => segment.text)).toEqual([
      'Opening line',
      'Trivia line',
      'Final line'
    ]);
  });

  it('tries another caption track when the preferred track is empty', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/watch')) {
        return new Response(`
          <script>
            var ytInitialPlayerResponse = ${JSON.stringify({
              captions: {
                playerCaptionsTracklistRenderer: {
                  captionTracks: [
                    {
                      baseUrl: 'https://www.youtube.com/api/timedtext?v=SHt3FyE-VIQ&lang=en&kind=asr',
                      kind: 'asr',
                      languageCode: 'en'
                    },
                    {
                      baseUrl: 'https://www.youtube.com/api/timedtext?v=SHt3FyE-VIQ&lang=es',
                      languageCode: 'es'
                    }
                  ]
                }
              }
            })};
          </script>
        `);
      }

      if (url.includes('lang=en')) {
        return new Response(JSON.stringify({ events: [] }));
      }

      return new Response(JSON.stringify({
        events: [
          { dDurationMs: 1000, segs: [{ utf8: 'Fallback line' }], tStartMs: 12000 }
        ]
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = await fetchReplayTriviaTranscriptWindow({
      videoId: 'SHt3FyE-VIQ'
    });

    expect(request.languageCode).toBe('es');
    expect(request.segments.map((segment) => segment.text)).toEqual(['Fallback line']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('falls back to the YouTube transcript panel when caption tracks are empty', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/watch')) {
        return new Response(`
          <script>
            var ytInitialPlayerResponse = ${JSON.stringify({
              captions: {
                playerCaptionsTracklistRenderer: {
                  captionTracks: [
                    {
                      baseUrl: 'https://www.youtube.com/api/timedtext?v=SHt3FyE-VIQ&lang=en',
                      languageCode: 'en'
                    }
                  ]
                }
              }
            })};
            ytcfg.set({
              "INNERTUBE_API_KEY": "test_key",
              "INNERTUBE_CLIENT_VERSION": "2.20260611.01.00",
              "VISITOR_DATA": "visitor"
            });
          </script>
        `);
      }

      if (url.startsWith('https://www.youtube.com/api/timedtext')) {
        return new Response(JSON.stringify({ events: [] }));
      }

      expect(url).toContain('https://www.youtube.com/youtubei/v1/get_panel');
      expect(url).toContain('key=test_key');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        panelId: 'PAmodern_transcript_view',
        params: 'qgkPCgtTSHQzRnlFLVZJURgB'
      });

      return new Response(JSON.stringify({
        actions: [
          {
            updateEngagementPanelAction: {
              content: {
                transcriptRenderer: {
                  content: {
                    transcriptSearchPanelRenderer: {
                      body: {
                        transcriptSegmentListRenderer: {
                          initialSegments: [
                            {
                              macroMarkersPanelItemViewModel: {
                                item: {
                                  timelineItemViewModel: {
                                    contentItems: [
                                      {
                                        transcriptSegmentViewModel: {
                                          simpleText: 'Panel fallback line',
                                          timestamp: '00:12'
                                        }
                                      }
                                    ]
                                  }
                                },
                                onTap: {
                                  innertubeCommand: {
                                    watchEndpoint: {
                                      startTimeSeconds: 12
                                    }
                                  }
                                }
                              }
                            }
                          ]
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = await fetchReplayTriviaTranscriptWindow({
      videoId: 'SHt3FyE-VIQ'
    });

    expect(request).toEqual({
      endSeconds: 15,
      languageCode: 'en',
      segments: [
        {
          durationSeconds: 3,
          startSeconds: 12,
          text: 'Panel fallback line'
        }
      ],
      startSeconds: 0,
      videoId: 'SHt3FyE-VIQ'
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('fetches transcript panel segments directly', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/watch')) {
        return new Response(`
          <script>
            ytcfg.set({
              "INNERTUBE_API_KEY": "test_key",
              "INNERTUBE_CLIENT_VERSION": "2.20260611.01.00"
            });
          </script>
        `);
      }

      return new Response(JSON.stringify({
        initialSegments: [
          {
            macroMarkersPanelItemViewModel: {
              item: {
                timelineItemViewModel: {
                  contentItems: [
                    {
                      transcriptSegmentViewModel: {
                        simpleText: 'Direct panel line',
                        timestamp: '01:02'
                      }
                    }
                  ]
                }
              }
            }
          }
        ]
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchTranscriptPanelSegments('SHt3FyE-VIQ')).resolves.toEqual([
      {
        durationSeconds: 3,
        startSeconds: 62,
        text: 'Direct panel line'
      }
    ]);
  });
});
