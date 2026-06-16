import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compactTranscriptSegments,
  createTranscriptPanelParams,
  createTranscriptWindow,
  extractInitialPlayerResponse,
  extractInnertubeApiKey,
  extractInnertubeClientVersion,
  extractVisitorData,
  fetchCaptionTrackSegments,
  fetchTranscriptPanelSegments,
  fetchReplayTriviaTranscriptWindow,
  fetchYouTubePlayerResponse,
  getTranscriptEndSeconds,
  parseJson3Transcript,
  parseTranscriptPanelSegments,
  parseXmlTranscript,
  pickCaptionTrack
} from './transcript';

afterEach(() => {
  document.cookie.split(';').forEach((cookie) => {
    const name = cookie.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Replay Trivia transcript collection', () => {
  it('extracts YouTube player metadata from watch HTML', () => {
    const html = `
      <script>
        var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc","languageCode":"en"}]}}};
        ytcfg.set({"INNERTUBE_API_KEY":"test_key","INNERTUBE_CLIENT_VERSION":"2.20260616.01.00","VISITOR_DATA":"visitor_data"});
      </script>
    `;

    expect(extractInitialPlayerResponse(html).captions?.playerCaptionsTracklistRenderer?.captionTracks).toHaveLength(1);
    expect(extractInnertubeApiKey(html)).toBe('test_key');
    expect(extractInnertubeClientVersion(html)).toBe('2.20260616.01.00');
    expect(extractVisitorData(html)).toBe('visitor_data');
    expect(extractInitialPlayerResponse('ytInitialPlayerResponse = {"unterminated": true')).toEqual({});
    expect(extractInnertubeApiKey('')).toBe('');
    expect(extractInnertubeClientVersion('')).toBe('');
    expect(extractVisitorData('')).toBe('');
    expect(extractInitialPlayerResponse('no player response here')).toEqual({});
    expect(extractInitialPlayerResponse('ytInitialPlayerResponse = true;')).toEqual({});
    expect(extractInitialPlayerResponse('ytInitialPlayerResponse = {"title":"quote \\" ok"};')).toEqual({
      title: 'quote " ok'
    });
    expect(extractInitialPlayerResponse('ytInitialPlayerResponse = {"broken": ')).toEqual({});
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
    expect(pickCaptionTrack([], ['en'])).toBeNull();
  });

  it('parses json3 and XML transcript payloads', () => {
    expect(parseJson3Transcript({
      events: [
        {
          dDurationMs: 1200,
          segs: [{ utf8: 'Hello ' }, { utf8: 'chat' }],
          tStartMs: 5000
        },
        null,
        {
          dDurationMs: 800,
          segs: [{ utf8: '' }],
          tStartMs: 6500
        },
        {
          segs: [{ utf8: 'No duration' }, { utf8: 123 }],
          tStartMs: 6800
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
      },
      {
        startSeconds: 6.8,
        text: 'No duration'
      }
    ]);
    expect(parseJson3Transcript(null)).toEqual([]);
    expect(parseJson3Transcript({ events: 'not-array' })).toEqual([]);

    expect(parseXmlTranscript('<transcript><text start="7.5" dur="2">Hi &amp; bye</text><text start="8" dur="bad">No duration</text><text start="bad">skip</text><text start="9"></text></transcript>')).toEqual([
      {
        durationSeconds: 2,
        startSeconds: 7.5,
        text: 'Hi & bye'
      },
      {
        startSeconds: 8,
        text: 'No duration'
      }
    ]);
  });

  it('uses the Innertube player fallback when watch HTML has no caption tracks', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/watch')) {
        return new Response(`
          <script>
            var ytInitialPlayerResponse = {};
            ytcfg.set({"INNERTUBE_API_KEY":"fallback_key"});
          </script>
        `);
      }

      expect(url).toBe('https://www.youtube.com/youtubei/v1/player?key=fallback_key');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        context: {
          client: {
            clientName: 'ANDROID'
          }
        },
        videoId: 'SHt3FyE-VIQ'
      });
      return new Response(JSON.stringify({
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
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchYouTubePlayerResponse('SHt3FyE-VIQ')).resolves.toMatchObject({
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              languageCode: 'en'
            }
          ]
        }
      }
    });
  });

  it('reports watch and Innertube player request failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));

    await expect(fetchYouTubePlayerResponse('SHt3FyE-VIQ')).rejects.toThrow('YouTube watch request failed with 404.');

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/watch')) {
        return new Response('<script>var ytInitialPlayerResponse = {}; ytcfg.set({"INNERTUBE_API_KEY":"test_key"});</script>');
      }
      return new Response('bad', { status: 503 });
    }));

    await expect(fetchYouTubePlayerResponse('SHt3FyE-VIQ')).rejects.toThrow('YouTube player request failed with 503.');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<script>var ytInitialPlayerResponse = {};</script>')));

    await expect(fetchYouTubePlayerResponse('SHt3FyE-VIQ')).rejects.toThrow('Could not find YouTube Innertube API key.');
  });

  it('creates the transcript panel params used by YouTube get_panel', () => {
    expect(createTranscriptPanelParams('SHt3FyE-VIQ')).toBe('qgkPCgtTSHQzRnlFLVZJURgB');
    expect(createTranscriptPanelParams('x'.repeat(130))).toMatch(/^qgm/);
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
                          createPanelMarker('WELCOME TO THE GAME AWARDS.', '23:40', 1420),
                          createPanelMarker('Next line', '23:52', 1432, true),
                          createPanelMarker('Duplicate line', '00:05', '5'),
                          createPanelMarker('Duplicate line', '00:05', '5'),
                          createPanelMarker('Timestamp fallback', '1:02:03'),
                          createPanelMarker('Bad timestamp', 'bad:value'),
                          createPanelMarker('Bad numeric start', '00:07', 'not-a-number'),
                          createPanelMarker('Missing start fallback', '00:08', undefined),
                          {
                            macroMarkersPanelItemViewModel: null
                          },
                          {
                            macroMarkersPanelItemViewModel: {
                              transcriptSegmentViewModel: {}
                            }
                          },
                          {
                            macroMarkersPanelItemViewModel: {
                              transcriptSegmentViewModel: {
                                runs: [{ text: 'Run ' }, { text: 123 }, { text: 'fallback' }]
                              },
                              watchEndpoint: {
                                startTimeSeconds: 7
                              }
                            }
                          },
                          {
                            macroMarkersPanelItemViewModel: {
                              transcriptSegmentViewModel: {
                                simpleText: 'No timestamp'
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
        durationSeconds: 2,
        startSeconds: 5,
        text: 'Duplicate line'
      },
      {
        durationSeconds: 3,
        startSeconds: 7,
        text: 'Bad numeric start'
      },
      {
        durationSeconds: 1,
        startSeconds: 7,
        text: 'Run fallback'
      },
      {
        durationSeconds: 1412,
        startSeconds: 8,
        text: 'Missing start fallback'
      },
      {
        durationSeconds: 12,
        startSeconds: 1420,
        text: 'WELCOME TO THE GAME AWARDS.'
      },
      {
        durationSeconds: 2291,
        startSeconds: 1432,
        text: 'Next line'
      },
      {
        durationSeconds: 3,
        startSeconds: 3723,
        text: 'Timestamp fallback'
      }
    ]);
    expect(parseTranscriptPanelSegments(null)).toEqual([]);
    expect(parseTranscriptPanelSegments({
      macroMarkersPanelItemViewModel: {
        transcriptSegmentViewModel: {
          simpleText: ''
        }
      }
    })).toEqual([]);
  });

  it('filters transcript segments to the requested replay window', () => {
    expect(createTranscriptWindow([
      { durationSeconds: 2, startSeconds: 8, text: 'before' },
      { durationSeconds: 3, startSeconds: 10, text: 'start' },
      { startSeconds: 19.5, text: 'instant' },
      { durationSeconds: 3, startSeconds: 20, text: 'end' }
    ], 10, 20)).toEqual([
      { durationSeconds: 3, startSeconds: 10, text: 'start' },
      { startSeconds: 19.5, text: 'instant' }
    ]);
    expect(getTranscriptEndSeconds([
      { durationSeconds: -1, startSeconds: 1, text: 'negative duration' },
      { durationSeconds: 2.5, startSeconds: 8, text: 'line' },
      { startSeconds: 20, text: 'last' }
    ])).toBe(20);
  });

  it('compacts adjacent transcript segments without crossing larger gaps', () => {
    const compacted = compactTranscriptSegments([
      { durationSeconds: 1, startSeconds: 1, text: 'first' },
      { durationSeconds: 1, startSeconds: 2, text: 'second' },
      { durationSeconds: 1, startSeconds: 3.2, text: 'third' },
      { durationSeconds: 0, startSeconds: 6, text: '   ' },
      { durationSeconds: 1, startSeconds: 10, text: 'after gap' }
    ]);

    expect(compacted).toEqual([
      {
        durationSeconds: 3.2,
        startSeconds: 1,
        text: 'first second third'
      },
      {
        durationSeconds: 1,
        startSeconds: 10,
        text: 'after gap'
      }
    ]);
  });

  it('keeps compacted transcript segments under the backend segment size', () => {
    const compacted = compactTranscriptSegments([
      { durationSeconds: 1, startSeconds: 1, text: 'a'.repeat(300) },
      { durationSeconds: 1, startSeconds: 2, text: 'b'.repeat(300) }
    ]);

    expect(compacted.map((segment) => segment.text.length)).toEqual([300, 300]);
  });

  it('keeps zero-length compacted transcript segments durationless', () => {
    expect(compactTranscriptSegments([])).toEqual([]);
    expect(compactTranscriptSegments([
      { startSeconds: 3, text: 'instant line' }
    ])).toEqual([
      {
        startSeconds: 3,
        text: 'instant line'
      }
    ]);
  });

  it('falls back from json3 parsing to XML transcript parsing', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response('<transcript><text start="1" dur="2">XML line</text></transcript>'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCaptionTrackSegments('https://www.youtube.com/api/timedtext?v=SHt3FyE-VIQ')).resolves.toEqual([
      {
        durationSeconds: 2,
        startSeconds: 1,
        text: 'XML line'
      }
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('fmt=json3');
  });

  it('reports caption track request failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 429 })));

    await expect(fetchCaptionTrackSegments('https://www.youtube.com/api/timedtext?v=SHt3FyE-VIQ')).rejects.toThrow('Transcript request failed with 429.');
  });

  it('rejects invalid video IDs and empty transcript windows', async () => {
    await expect(fetchReplayTriviaTranscriptWindow({
      videoId: 'not valid'
    })).rejects.toThrow('A YouTube video ID is required for Replay Trivia.');

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/watch')) {
        return new Response(`
          <script>
            var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[]}}};
            ytcfg.set({"INNERTUBE_API_KEY":"test_key"});
          </script>
        `);
      }

      if (url.includes('/youtubei/v1/player')) {
        return new Response(JSON.stringify({
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: []
            }
          }
        }));
      }

      return new Response(JSON.stringify({ actions: [] }));
    }));

    await expect(fetchReplayTriviaTranscriptWindow({
      videoId: 'SHt3FyE-VIQ'
    })).rejects.toThrow('No transcript text was found in this replay window.');
  });

  it('rejects when transcript panel segments do not overlap the requested window', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/watch')) {
        return new Response(`
          <script>
            var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[]}}};
            ytcfg.set({"INNERTUBE_API_KEY":"test_key"});
          </script>
        `);
      }

      if (url.includes('/youtubei/v1/player')) {
        return new Response(JSON.stringify({
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: []
            }
          }
        }));
      }

      return new Response(JSON.stringify({
        initialSegments: [
          createPanelMarker('Outside requested window', '00:05', 5)
        ]
      }));
    }));

    await expect(fetchReplayTriviaTranscriptWindow({
      endSeconds: 30,
      startSeconds: 20,
      videoId: 'SHt3FyE-VIQ'
    })).rejects.toThrow('No transcript text was found in this replay window.');
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

  it('uses authorization headers for transcript panel requests when YouTube cookies are present', async () => {
    document.cookie = 'SAPISID=session-cookie';
    const digest = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async () => digest)
      }
    });
    vi.setSystemTime(new Date(1_800_000));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/watch')) {
        return new Response(`
          <script>
            ytcfg.set({
              "INNERTUBE_API_KEY": "test_key",
              "VISITOR_DATA": "visitor"
            });
          </script>
        `);
      }

      expect(url).not.toContain('key=test_key');
      expect(init?.headers).toMatchObject({
        Authorization: 'SAPISIDHASH 1800_deadbeef_u',
        'X-Goog-AuthUser': '0',
        'X-Goog-Visitor-Id': 'visitor',
        'X-YouTube-Client-Version': '2.20260611.01.00'
      });
      return new Response(JSON.stringify({ actions: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchTranscriptPanelSegments('SHt3FyE-VIQ')).resolves.toEqual([]);
  });

  it('falls back to API key headers when auth cookies cannot be hashed', async () => {
    document.cookie = 'SAPISID=session-cookie';
    vi.stubGlobal('crypto', {});
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/watch')) {
        return new Response('<script>ytcfg.set({"INNERTUBE_API_KEY":"test_key","VISITOR_DATA":"visitor"});</script>');
      }

      expect(url).toContain('key=test_key');
      expect(init?.headers).toMatchObject({
        'X-Goog-Api-Key': 'test_key',
        'X-Goog-Visitor-Id': 'visitor'
      });
      expect(init?.headers).not.toHaveProperty('Authorization');
      return new Response(JSON.stringify({ actions: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchTranscriptPanelSegments('SHt3FyE-VIQ')).resolves.toEqual([]);
  });

  it('returns an empty panel transcript when YouTube rejects the panel request', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/watch')) {
        return new Response('<script>ytcfg.set({"INNERTUBE_API_KEY":"test_key"});</script>');
      }

      return new Response('forbidden', { status: 403 });
    }));

    await expect(fetchTranscriptPanelSegments('SHt3FyE-VIQ')).resolves.toEqual([]);
  });
});

function createPanelMarker(
  text: string,
  timestamp: string,
  startTimeSeconds?: number | string,
  useRuns = false
) {
  return {
    macroMarkersPanelItemViewModel: {
      item: {
        timelineItemViewModel: {
          contentItems: [
            {
              transcriptSegmentViewModel: {
                ...(useRuns
                  ? { runs: text.split(' ').map((part, index) => ({ text: `${index ? ' ' : ''}${part}` })) }
                  : { simpleText: text }),
                timestamp
              }
            }
          ]
        }
      },
      ...(startTimeSeconds !== undefined
        ? {
            onTap: {
              innertubeCommand: {
                watchEndpoint: {
                  startTimeSeconds
                }
              }
            }
          }
        : {})
    }
  };
}
