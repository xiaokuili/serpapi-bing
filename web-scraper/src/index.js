const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let browser = null;

// 错误类型和状态码定义
const ERROR_TYPES = {
    SUCCESS: { code: 200, message: 'Success' },
    TIMEOUT_ERROR: { code: 408, message: 'Request timeout' },
    ANTI_BOT_DETECTED: { code: 429, message: 'Anti-bot protection detected' },
    NETWORK_ERROR: { code: 503, message: 'Network error' },
    NO_RESULTS: { code: 404, message: 'No search results found' },
    PARSING_ERROR: { code: 422, message: 'Failed to parse page content' },
    UNKNOWN_ERROR: { code: 500, message: 'Unknown error occurred' },
    MAX_RETRIES_EXCEEDED: { code: 503, message: 'Maximum retries exceeded' }
};

// 配置参数
const CONFIG = {
    MAX_RETRIES: 3,
    BASE_TIMEOUT: 30000,
    RETRY_DELAY: 2000,
    PAGE_LOAD_TIMEOUT: 45000,
    NETWORK_IDLE_TIMEOUT: 10000
};

// Initialize browser
async function initBrowser() {
    if (!browser) {
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
    }
    return browser;
}

// 错误分类函数
function classifyError(error, pageContent = '') {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('timeout') || errorMessage.includes('navigation timeout')) {
        return ERROR_TYPES.TIMEOUT_ERROR;
    }

    if (pageContent.includes('captcha') ||
        pageContent.includes('verification') ||
        pageContent.includes('blocked') ||
        pageContent.includes('robot')) {
        return ERROR_TYPES.ANTI_BOT_DETECTED;
    }

    if (errorMessage.includes('net::err_') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('dns')) {
        return ERROR_TYPES.NETWORK_ERROR;
    }

    if (errorMessage.includes('parse') || errorMessage.includes('selector')) {
        return ERROR_TYPES.PARSING_ERROR;
    }

    return ERROR_TYPES.UNKNOWN_ERROR;
}

// 检测反爬虫机制
async function detectAntiBot(page) {
    try {
        const indicators = await page.evaluate(() => {
            const bodyText = document.body.textContent.toLowerCase();
            return {
                hasCaptcha: !!document.querySelector('.captcha, #captcha, [id*="captcha"], [class*="captcha"]'),
                hasVerification: bodyText.includes('verification') || bodyText.includes('verify'),
                hasBlocked: bodyText.includes('blocked') || bodyText.includes('access denied'),
                hasRobot: bodyText.includes('robot') || bodyText.includes('bot detected'),
                hasRedirect: window.location.href.includes('sorry') || window.location.href.includes('blocked')
            };
        });

        return Object.values(indicators).some(indicator => indicator);
    } catch (error) {
        console.warn('检测反爬虫机制时出错:', error.message);
        return false;
    }
}

// 验证搜索结果质量
function validateResults(results) {
    if (!results.organic_results || results.organic_results.length === 0) {
        return { isValid: false, error: ERROR_TYPES.NO_RESULTS };
    }

    // 检查结果是否包含有效内容
    const validResults = results.organic_results.filter(result =>
        result.title && result.title.trim().length > 0 &&
        result.snippet && result.snippet.trim().length > 10
    );

    if (validResults.length === 0) {
        return { isValid: false, error: ERROR_TYPES.NO_RESULTS };
    }

    return { isValid: true, validResults };
}

// 核心爬取函数
async function scrapeBingCore(query, pageLimit = 1) {
    console.log(`开始搜索: ${query}, 页数限制: ${pageLimit}`);

    const browser = await initBrowser();
    const page = await browser.newPage();

    try {
        // 设置更真实的浏览器环境
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        });

        // 设置viewport
        await page.setViewportSize({ width: 1366, height: 768 });

        const results = {
            search_parameters: {
                engine: 'bing',
                q: query,
                gl: 'us',
                hl: 'en'
            },
            answer_box: {},
            organic_results: [],
            related_searches: [],
            knowledge_graph: {},
            ads: [],
            error: null,
            status: ERROR_TYPES.SUCCESS
        };

        let currentPage = 1;
        while (currentPage <= pageLimit) {
            const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&first=${(currentPage - 1) * 10 + 1}`;
            console.log(`正在抓取第 ${currentPage} 页: ${searchUrl}`);

            // 页面导航，带超时控制
            await page.goto(searchUrl, {
                waitUntil: 'domcontentloaded',
                timeout: CONFIG.PAGE_LOAD_TIMEOUT
            });

            // 检测反爬虫机制
            const isBlocked = await detectAntiBot(page);
            if (isBlocked) {
                throw new Error('Anti-bot protection detected');
            }

            // 等待搜索结果容器，使用更灵活的选择器
            try {
                await page.waitForSelector('ol#b_results, .b_algo, #b_content', {
                    timeout: CONFIG.BASE_TIMEOUT
                });
            } catch (selectorError) {
                // 如果找不到主要选择器，尝试检查页面内容
                const pageContent = await page.content();
                if (pageContent.includes('No results found') || pageContent.includes('没有找到结果')) {
                    console.log('页面显示无搜索结果');
                    break;
                }
                throw selectorError;
            }

            // 等待网络空闲
            try {
                await page.waitForLoadState('networkidle', { timeout: CONFIG.NETWORK_IDLE_TIMEOUT });
            } catch (networkError) {
                console.warn('网络空闲等待超时，继续执行:', networkError.message);
            }

            // 提取页面数据
            const pageData = await page.evaluate(() => {
                const data = {
                    answer_box: {},
                    organic_results: [],
                    related_searches: [],
                    knowledge_graph: {},
                    ads: [],
                    hasResults: false,
                    resultCount: 0
                };

                try {
                    // Extract answer box
                    const answerBox = document.querySelector('div.b_text, div.b_ans_box, div#b_context div.b_ans, div.b_factrow');
                    if (answerBox) {
                        data.answer_box = {
                            title: answerBox.querySelector('h2, .b_ans_title, .b_entityTitle h2')?.textContent?.trim() || '',
                            snippet: answerBox.querySelector('p, .b_ans_text, .b_entityDescription p')?.textContent?.trim() || '',
                            link: answerBox.querySelector('a')?.href || '',
                            type: 'featured_snippet'
                        };
                    }

                    // Extract organic results
                    const organicElements = document.querySelectorAll('li.b_algo');
                    data.resultCount = organicElements.length;
                    data.hasResults = organicElements.length > 0;

                    organicElements.forEach((item, index) => {
                        try {
                            const titleEl = item.querySelector('h2 a');
                            const snippetEl = item.querySelector('div.b_caption p, .b_caption p');
                            const linkEl = item.querySelector('cite');
                            const faviconEl = item.querySelector('img.favicon');

                            if (titleEl && snippetEl) {
                                data.organic_results.push({
                                    position: index + 1,
                                    title: titleEl.textContent?.trim() || '',
                                    link: titleEl.href || '',
                                    snippet: snippetEl.textContent?.trim() || '',
                                    displayed_link: linkEl?.textContent?.trim() || titleEl.href || '',
                                    favicon: faviconEl?.src || ''
                                });
                            }
                        } catch (itemError) {
                            console.warn(`提取第 ${index + 1} 个结果时出错:`, itemError);
                        }
                    });

                    // Extract related searches
                    const relatedSearches = document.querySelector('#b_context .b_ans ul.b_vList, #brs_section ul');
                    if (relatedSearches) {
                        relatedSearches.querySelectorAll('li a').forEach(link => {
                            try {
                                const text = link.textContent?.trim();
                                if (text && text.length > 0) {
                                    data.related_searches.push({ query: text });
                                }
                            } catch (linkError) {
                                console.warn('提取相关搜索时出错:', linkError);
                            }
                        });
                    }

                    // Extract knowledge graph
                    const kgCard = document.querySelector('.b_sideWrap');
                    if (kgCard) {
                        data.knowledge_graph = {
                            title: kgCard.querySelector('.b_entityTitle h2')?.textContent?.trim() || '',
                            description: kgCard.querySelector('.b_entityDescription p')?.textContent?.trim() || '',
                            image: kgCard.querySelector('.b_entityImage img')?.src || ''
                        };
                    }

                    // Extract ads
                    document.querySelectorAll('li.b_ad, li.b_ad_hl, div.ad_unit').forEach(ad => {
                        try {
                            const titleEl = ad.querySelector('h2 a, .ad_title a');
                            const snippetEl = ad.querySelector('div.b_caption p, .ad_snippet p');
                            const linkEl = ad.querySelector('cite, .ad_display_url');

                            if (titleEl) {
                                data.ads.push({
                                    title: titleEl.textContent?.trim() || '',
                                    link: titleEl.href || '',
                                    snippet: snippetEl?.textContent?.trim() || '',
                                    displayed_link: linkEl?.textContent?.trim() || '',
                                    is_advertisement: true
                                });
                            }
                        } catch (adError) {
                            console.warn('提取广告时出错:', adError);
                        }
                    });

                } catch (extractError) {
                    console.warn('数据提取过程中出错:', extractError);
                }

                return data;
            });

            // 合并页面数据
            if (pageData.hasResults) {
                results.organic_results.push(...pageData.organic_results);
                if (currentPage === 1) {
                    // 只在第一页获取这些数据
                    Object.assign(results.answer_box, pageData.answer_box);
                    Object.assign(results.knowledge_graph, pageData.knowledge_graph);
                    results.related_searches = pageData.related_searches;
                    results.ads = pageData.ads;
                }
            }

            // 检查是否有下一页
            const hasNextPage = await page.evaluate(() => {
                const nextButton = document.querySelector('a.sb_pagN[aria-label="Next page"], .sb_pagN');
                return !!nextButton && !nextButton.disabled;
            });

            if (hasNextPage && currentPage < pageLimit && pageData.hasResults) {
                try {
                    await page.click('a.sb_pagN[aria-label="Next page"], .sb_pagN');
                    currentPage++;
                    await page.waitForTimeout(CONFIG.RETRY_DELAY);
                } catch (nextPageError) {
                    console.warn('点击下一页失败:', nextPageError.message);
                    break;
                }
            } else {
                break;
            }
        }

        // 验证结果质量
        const validation = validateResults(results);
        if (!validation.isValid) {
            results.status = validation.error;
            results.error = validation.error.message;
        }

        console.log(`搜索完成, 获取到 ${results.organic_results.length} 个结果`);
        return results;

    } catch (error) {
        const pageContent = await page.content().catch(() => '');
        const errorType = classifyError(error, pageContent);

        console.error(`搜索过程中出错: ${error.message}`);

        return {
            error: errorType.message,
            status: errorType,
            search_parameters: { q: query },
            organic_results: [],
            answer_box: {},
            related_searches: [],
            knowledge_graph: {},
            ads: []
        };
    } finally {
        await page.close().catch(err => console.warn('关闭页面时出错:', err.message));
    }
}

// 带重试机制的爬取函数
async function scrapeBingWithRetry(query, pageLimit = 1, maxRetries = CONFIG.MAX_RETRIES) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`第 ${attempt}/${maxRetries} 次尝试搜索: ${query}`);

            const result = await scrapeBingCore(query, pageLimit);

            // 如果成功获取到结果，直接返回
            if (result.status.code === 200 && result.organic_results.length > 0) {
                console.log(`第 ${attempt} 次尝试成功`);
                return result;
            }

            // 如果是反爬虫检测，等待更长时间后重试
            if (result.status.code === 429) {
                console.log(`检测到反爬虫机制，等待 ${CONFIG.RETRY_DELAY * attempt * 2}ms 后重试...`);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * attempt * 2));
                    continue;
                }
            }

            // 如果是无结果，可能是查询词问题，少重试几次
            if (result.status.code === 404 && attempt >= 2) {
                console.log('连续无结果，可能是查询词问题');
                return result;
            }

            lastError = result;

        } catch (error) {
            console.log(`第 ${attempt} 次尝试失败: ${error.message}`);
            lastError = {
                error: error.message,
                status: classifyError(error),
                search_parameters: { q: query },
                organic_results: []
            };
        }

        // 如果不是最后一次尝试，等待后重试
        if (attempt < maxRetries) {
            const delay = CONFIG.RETRY_DELAY * attempt;
            console.log(`等待 ${delay}ms 后进行第 ${attempt + 1} 次尝试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // 所有重试都失败了
    console.error(`尝试 ${maxRetries} 次后仍然失败`);
    return {
        ...lastError,
        status: ERROR_TYPES.MAX_RETRIES_EXCEEDED,
        error: `尝试 ${maxRetries} 次后仍然失败: ${lastError?.error || '未知错误'}`,
        retries: maxRetries
    };
}

// API endpoint for Bing search
app.post('/api/scrape/bing', async (req, res) => {
    try {
        const { query, pageLimit = 1, maxRetries = CONFIG.MAX_RETRIES } = req.body;

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({
                error: 'Valid query parameter is required',
                status: { code: 400, message: 'Bad Request' }
            });
        }

        const results = await scrapeBingWithRetry(query.trim(), pageLimit, maxRetries);

        // 根据结果状态返回相应的HTTP状态码
        res.status(results.status.code).json(results);

    } catch (error) {
        console.error('API处理过程中出错:', error);
        res.status(500).json({
            error: error.message,
            status: ERROR_TYPES.UNKNOWN_ERROR
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        config: {
            maxRetries: CONFIG.MAX_RETRIES,
            timeout: CONFIG.BASE_TIMEOUT
        }
    });
});

// Start server
app.listen(port, () => {
    console.log(`Web scraper service listening on port ${port}`);
    console.log(`Configuration:`, CONFIG);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('收到SIGTERM信号，开始优雅关闭...');
    if (browser) {
        await browser.close();
        console.log('浏览器已关闭');
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('收到SIGINT信号，开始优雅关闭...');
    if (browser) {
        await browser.close();
        console.log('浏览器已关闭');
    }
    process.exit(0);
}); 