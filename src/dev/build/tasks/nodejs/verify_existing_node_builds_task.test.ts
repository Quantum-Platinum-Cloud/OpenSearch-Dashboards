/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import {
  ToolingLog,
  ToolingLogCollectingWriter,
  createAnyInstanceSerializer,
} from '@osd/dev-utils';

import { Config, Platform } from '../../lib';
import { VerifyExistingNodeBuilds } from './verify_existing_node_builds_task';

jest.mock('./node_shasums');
jest.mock('./node_download_info');
jest.mock('../../lib/fs');
jest.mock('../../lib/get_build_number');

const { getNodeShasums } = jest.requireMock('./node_shasums');
const { getNodeDownloadInfo, getLatestNodeVersion } = jest.requireMock('./node_download_info');
const { getFileHash } = jest.requireMock('../../lib/fs');

const log = new ToolingLog();
const testWriter = new ToolingLogCollectingWriter();
log.setWriters([testWriter]);

expect.addSnapshotSerializer(createAnyInstanceSerializer(Config));
expect.addSnapshotSerializer(createAnyInstanceSerializer(ToolingLog));

async function setup(actualShaSums?: Record<string, string>) {
  const config = await Config.create({
    isRelease: true,
    targetAllPlatforms: true,
    targetPlatforms: {
      linux: false,
      linuxArm: false,
      darwin: false,
      windows: false,
    },
  });

  getNodeShasums.mockReturnValue(
    Object.fromEntries(
      config.getTargetPlatforms().map((platform) => {
        return [`${platform.getName()}:${platform.getNodeArch()}:downloadName`, 'valid shasum'];
      })
    )
  );

  getNodeDownloadInfo.mockImplementation((_: Config, platform: Platform) => {
    return {
      downloadPath: `${platform.getName()}:${platform.getNodeArch()}:downloadPath`,
      downloadName: `${platform.getName()}:${platform.getNodeArch()}:downloadName`,
      version: '<node version>',
    };
  });

  getLatestNodeVersion.mockReturnValue('<node version>');

  getFileHash.mockImplementation((downloadPath: string) => {
    if (actualShaSums?.[downloadPath]) {
      return actualShaSums[downloadPath];
    }

    return 'valid shasum';
  });

  return { config };
}

beforeEach(() => {
  testWriter.messages.length = 0;
  jest.clearAllMocks();
});

it('checks shasums for each downloaded node build', async () => {
  const { config } = await setup();

  await VerifyExistingNodeBuilds.run(config, log, []);

  expect(getNodeShasums).toMatchInlineSnapshot(`
    [MockFunction] {
      "calls": Array [
        Array [
          <ToolingLog>,
          "<node version>",
        ],
      ],
      "results": Array [
        Object {
          "type": "return",
          "value": Object {
            "darwin:darwin-x64:downloadName": "valid shasum",
            "linux:linux-arm64:downloadName": "valid shasum",
            "linux:linux-x64:downloadName": "valid shasum",
            "win32:win32-x64:downloadName": "valid shasum",
          },
        },
      ],
    }
  `);
  expect(getNodeDownloadInfo).toMatchInlineSnapshot(`
    [MockFunction] {
      "calls": Array [
        Array [
          <Config>,
          Platform {
            "architecture": "x64",
            "buildName": "linux-x64",
            "name": "linux",
          },
        ],
        Array [
          <Config>,
          Platform {
            "architecture": "arm64",
            "buildName": "linux-arm64",
            "name": "linux",
          },
        ],
        Array [
          <Config>,
          Platform {
            "architecture": "x64",
            "buildName": "darwin-x64",
            "name": "darwin",
          },
        ],
        Array [
          <Config>,
          Platform {
            "architecture": "x64",
            "buildName": "windows-x64",
            "name": "win32",
          },
        ],
      ],
      "results": Array [
        Object {
          "type": "return",
          "value": Object {
            "downloadName": "linux:linux-x64:downloadName",
            "downloadPath": "linux:linux-x64:downloadPath",
            "version": "<node version>",
          },
        },
        Object {
          "type": "return",
          "value": Object {
            "downloadName": "linux:linux-arm64:downloadName",
            "downloadPath": "linux:linux-arm64:downloadPath",
            "version": "<node version>",
          },
        },
        Object {
          "type": "return",
          "value": Object {
            "downloadName": "darwin:darwin-x64:downloadName",
            "downloadPath": "darwin:darwin-x64:downloadPath",
            "version": "<node version>",
          },
        },
        Object {
          "type": "return",
          "value": Object {
            "downloadName": "win32:win32-x64:downloadName",
            "downloadPath": "win32:win32-x64:downloadPath",
            "version": "<node version>",
          },
        },
      ],
    }
  `);
  expect(getFileHash).toMatchInlineSnapshot(`
    [MockFunction] {
      "calls": Array [
        Array [
          "linux:linux-x64:downloadPath",
          "sha256",
        ],
        Array [
          "linux:linux-arm64:downloadPath",
          "sha256",
        ],
        Array [
          "darwin:darwin-x64:downloadPath",
          "sha256",
        ],
        Array [
          "win32:win32-x64:downloadPath",
          "sha256",
        ],
      ],
      "results": Array [
        Object {
          "type": "return",
          "value": "valid shasum",
        },
        Object {
          "type": "return",
          "value": "valid shasum",
        },
        Object {
          "type": "return",
          "value": "valid shasum",
        },
        Object {
          "type": "return",
          "value": "valid shasum",
        },
      ],
    }
  `);
});

it('rejects if any download has an incorrect sha256', async () => {
  const { config } = await setup({
    'linux:linux-arm64:downloadPath': 'invalid shasum',
  });

  await expect(
    VerifyExistingNodeBuilds.run(config, log, [])
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `"Download at linux:linux-arm64:downloadPath does not match expected checksum invalid shasum"`
  );
});
