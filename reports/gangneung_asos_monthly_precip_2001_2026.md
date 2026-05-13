# Gangneung ASOS Monthly Precipitation

Source: KMA API Hub `kma_sfcdd3.php`

Station: 105 (Gangneung)

Requested period: 2001-01-01 to 2026-05-11

Actual rows: 9262 daily rows, 305 monthly rows

Actual covered period: 20010101 to 20260511

RN_DAY field position from `help=1`: 39 of 56

Normalization: negative `RN_DAY` sentinel values are preserved in `rn_day_raw` and treated as 0 mm for monthly accumulation.

Total normalized precipitation: 36586.8 mm

Maximum monthly precipitation: 2002-08, 1137.0 mm

Outputs:

- Daily CSV: `D:\WORK\Projects\Codex\kmahub\data\gangneung_asos_precip\gangneung_asos_daily_precip_2001_2026.csv`
- Monthly CSV: `D:\WORK\Projects\Codex\kmahub\data\gangneung_asos_precip\gangneung_asos_monthly_precip_2001_2026.csv`
- Plot SVG: `D:\WORK\Projects\Codex\kmahub\data\gangneung_asos_precip\gangneung_asos_monthly_precip_2001_2026.svg`

Fetch summary:

| Year | Period | Rows | Status | Bytes | Elapsed ms |
| --- | --- | ---: | ---: | ---: | ---: |
| 2001 | 20010101-20011231 | 365 | 200 | 122253 | 646 |
| 2002 | 20020101-20021231 | 365 | 200 | 122255 | 251 |
| 2003 | 20030101-20031231 | 365 | 200 | 122261 | 191 |
| 2004 | 20040101-20041231 | 366 | 200 | 122577 | 167 |
| 2005 | 20050101-20051231 | 365 | 200 | 122257 | 173 |
| 2006 | 20060101-20061231 | 365 | 200 | 122259 | 166 |
| 2007 | 20070101-20071231 | 365 | 200 | 122258 | 164 |
| 2008 | 20080101-20081231 | 366 | 200 | 122578 | 575 |
| 2009 | 20090101-20091231 | 365 | 200 | 122254 | 164 |
| 2010 | 20100101-20101231 | 365 | 200 | 122253 | 178 |
| 2011 | 20110101-20111231 | 365 | 200 | 122253 | 171 |
| 2012 | 20120101-20121231 | 366 | 200 | 122578 | 174 |
| 2013 | 20130101-20131231 | 365 | 200 | 122256 | 171 |
| 2014 | 20140101-20141231 | 365 | 200 | 122255 | 160 |
| 2015 | 20150101-20151231 | 365 | 200 | 122253 | 183 |
| 2016 | 20160101-20161231 | 366 | 200 | 122577 | 147 |
| 2017 | 20170101-20171231 | 365 | 200 | 122253 | 153 |
| 2018 | 20180101-20181231 | 365 | 200 | 122253 | 174 |
| 2019 | 20190101-20191231 | 365 | 200 | 122259 | 189 |
| 2020 | 20200101-20201231 | 366 | 200 | 122582 | 153 |
| 2021 | 20210101-20211231 | 365 | 200 | 122256 | 143 |
| 2022 | 20220101-20221231 | 365 | 200 | 122253 | 177 |
| 2023 | 20230101-20231231 | 365 | 200 | 122255 | 175 |
| 2024 | 20240101-20241231 | 366 | 200 | 122585 | 175 |
| 2025 | 20250101-20251231 | 365 | 200 | 122256 | 1156 |
| 2026 | 20260101-20260511 | 131 | 200 | 46437 | 197 |
